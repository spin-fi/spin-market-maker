import { createSpotApi, SpotApi } from '@spinfi/node'
import { spot } from '@spinfi/core'
import config from '../configs/config.js'
import logger from '../logger/index.js'
import { Balances, BatchOpsPlace, BatchOpsRequest, GridOrders } from './types.js'
import BigNumber from 'bignumber.js'
import { NearClient } from './near.js'
import {
  convertToDecimals,
  convertWithDecimals,
  declOfNum,
  DEFAULT_GAS_MAX,
  getContractId,
  getDeadline,
  sumOrdersNative,
} from './utils.js'

const nearNative = new NearClient()

BigNumber.set({ EXPONENTIAL_AT: 30 })

export class Client {
  private api: SpotApi
  private market: spot.Market
  private balances: Balances
  private first_balance_log: boolean
  tick_size: number
  step_size: number
  min_base_size: number
  min_quote_size: number

  constructor() {
    this.api
    this.market
    this.balances
    this.tick_size
    this.step_size
    this.min_base_size
    this.min_quote_size
    this.first_balance_log = true
  }

  async init(): Promise<void> {
    this.api = await createSpotApi({
      // @ts-ignore
      network: config.get('network'),
      accountId: config.get('account_id'),
      privateKey: config.get('private_key'),
      contractId: getContractId(),
    })
    this.market = await this.setMarket()

    logger.info(
      `${config.get('network')} | ${getContractId()} | ${config.get('account_id')} | market_id: ${this.market.id} (${
        this.market.base.symbol
      }/${this.market.quote.symbol})`,
    )

    this.balances = await this.setBalances()
  }

  private async setMarket() {
    try {
      const market = await this.api.spin.getMarket({
        marketId: config.get('grid.market_id'),
      })

      this.tick_size = convertWithDecimals(market.limits.tick_size, market.quote.decimal)

      this.step_size = convertWithDecimals(market.limits.step_size, market.base.decimal)

      this.min_base_size = convertWithDecimals(market.limits.min_base_quantity, market.base.decimal)

      this.min_quote_size = convertWithDecimals(market.limits.min_quote_quantity, market.quote.decimal)

      if (config.get('grid.levels_step') < this.tick_size) {
        throw Error(
          `Levels Step in configuration is lower than market step size. Increase it, or make equal. Levels Step Size: ${config.get(
            'grid.levels_step',
          )}. Market Tick Size: ${this.tick_size}`,
        )
      }

      return market
    } catch (error) {
      logger.error(error, 'Cant load market')
      throw Error('Cant sync market')
    }
  }

  async getMarket(): Promise<spot.Market> {
    if (!this.market) {
      await this.setMarket()
    }

    return this.market
  }

  async getOrders(): Promise<spot.GetOrderResponse[]> {
    try {
      return await this.api.spin.getOrders({
        accountId: config.get('account_id'),
        marketId: this.market.id,
      })
    } catch (error) {
      logger.error(error)
      return []
    }
  }

  async getL1() {
    try {
      return await nearNative.viewMethod({
        method: 'get_orderbook',
        args: { market_id: config.get('grid.market_id'), limit: 1 },
      })
    } catch (error) {
      throw Error('Cant load L1 orderbook')
    }
  }

  private async setBalances(): Promise<Balances> {
    const depositsRaw = await this.api.spin.getDeposits({
      accountId: config.get('account_id'),
    })
    const accountOrders = await this.getOrders()
    const bRaw: Balances = {
      base: {
        token: this.market.base.address,
        decimal: this.market.base.decimal,
        formatted: {
          balance: 0,
          available: 0,
          locked_in_orders: 0,
        },
        native: {
          available: this.market.base.address in depositsRaw ? depositsRaw[this.market.base.address] : '0',
          balance: '0',
          locked_in_orders: sumOrdersNative(accountOrders.filter((o) => o.o_type === 'Ask')),
        },
      },
      quote: {
        token: this.market.quote.address,
        decimal: this.market.quote.decimal,
        formatted: {
          balance: 0,
          available: 0,
          locked_in_orders: 0,
        },
        native: {
          available: this.market.quote.address in depositsRaw ? depositsRaw[this.market.quote.address] : '0',
          balance: '0',
          locked_in_orders: accountOrders
            .filter((o) => o.o_type === 'Bid')
            .reduce(
              (sum, o) =>
                new BigNumber(sum)
                  .plus(
                    new BigNumber(o.price).multipliedBy(
                      new BigNumber(o.remaining).dividedBy(
                        new BigNumber(10).pow(new BigNumber(this.market.base.decimal)),
                      ),
                    ),
                  )
                  .toString() || '0',
              '0',
            ),
        },
      },
    }

    bRaw.base.native.balance = new BigNumber(bRaw.base.native.available)
      .plus(bRaw.base.native.locked_in_orders)
      .toString()

    bRaw.quote.native.balance = new BigNumber(bRaw.quote.native.available)
      .plus(bRaw.quote.native.locked_in_orders)
      .toString()

    bRaw.base.formatted = {
      balance: convertWithDecimals(bRaw.base.native.balance, bRaw.base.decimal),
      available: convertWithDecimals(bRaw.base.native.available, bRaw.base.decimal),
      locked_in_orders: convertWithDecimals(bRaw.base.native.locked_in_orders, bRaw.base.decimal),
    }

    bRaw.quote.formatted = {
      balance: convertWithDecimals(bRaw.quote.native.balance, bRaw.quote.decimal),
      available: convertWithDecimals(bRaw.quote.native.available, bRaw.quote.decimal),
      locked_in_orders: convertWithDecimals(bRaw.quote.native.locked_in_orders, bRaw.quote.decimal),
    }
    if (this.first_balance_log) {
      logger.info('Current available balance, locked in orders, total: ')
      logger.info(
        `${this.market.base.symbol} — ${bRaw.base.formatted.available}, ${bRaw.base.formatted.locked_in_orders}, ${bRaw.base.formatted.balance}`,
      )
      logger.info(
        `${this.market.quote.symbol} — ${bRaw.quote.formatted.available}, ${bRaw.quote.formatted.locked_in_orders}, ${bRaw.quote.formatted.balance}`,
      )
      this.first_balance_log = false
    }
    return bRaw
  }

  async cancelAllOrders() {
    const orders = await this.getOrders()
    const ordersLength = orders.length
    if (!ordersLength) return null

    logger.info(`Cancelling ${orders.length} ${declOfNum(ordersLength, ['order', 'orders', 'orders'])}...`)

    try {
      await this.api.spin.cancelOrders({
        marketId: this.market.id,
      })
      logger.info(`Orders canceled on market #${this.market.id}`)
    } catch (error) {
      logger.error(error, `Error with cancelling orders on market #${this.market.id}`)

      throw Error('Error with cancelling orders')
    }
  }

  async getBalances(updateBalances = false) {
    if (updateBalances) {
      return await this.setBalances()
    }

    return this.balances
  }

  async batchOpsPlacing(orders: GridOrders) {
    const bidOrders: BatchOpsPlace[] = orders.bids.map((o) => ({
      side: 'Bid',
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      market_order: false,
    }))

    const askOrders: BatchOpsPlace[] = orders.asks.map((o) => ({
      side: 'Ask',
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      market_order: false,
    }))

    logger.info('Placing orders via batchOps')

    const batchOpsArgs: BatchOpsRequest = {
      ops: [
        {
          market_id: this.market.id,
          drop: [],
          place: [...bidOrders, ...askOrders],
        },
      ],
    }

    if (config.get('network') === 'testnet') {
      batchOpsArgs.deadline = getDeadline()
    }

    try {
      await nearNative.callMethod({
        method: 'batch_ops',
        args: batchOpsArgs,
        gas: DEFAULT_GAS_MAX,
      })
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }

  async cancelAndBatchOpsPlacing(orders: GridOrders) {
    const userOrdersRaw = await this.getOrders()
    const userOrdersIds = userOrdersRaw.map((o) => o.id)

    const bidOrders: BatchOpsPlace[] = orders.bids.map((o) => ({
      side: 'Bid',
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      market_order: false,
    }))

    const askOrders: BatchOpsPlace[] = orders.asks.map((o) => ({
      side: 'Ask',
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      market_order: false,
    }))

    logger.info('Canceling and placing orders via batchOps')

    const batchOpsArgs: BatchOpsRequest = {
      ops: [
        {
          market_id: this.market.id,
          drop: userOrdersIds,
          place: [...bidOrders, ...askOrders],
        },
      ],
    }

    if (config.get('network') === 'testnet') {
      batchOpsArgs.deadline = getDeadline()
    }

    try {
      await nearNative.callMethod({
        method: 'batch_ops',
        args: batchOpsArgs,
        gas: DEFAULT_GAS_MAX,
      })
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }

  async deposit(token: string, amount: string) {
    if (token === 'near.near' || token === 'near') {
      return await this.api.spin.depositNear({
        amount: BigInt(amount),
      })
    } else {
      return await this.api.spin.deposit({
        tokenAddress: token,
        amount: BigInt(amount),
      })
    }
  }

  async withdraw(token: string, amount: string) {
    return await this.api.spin.withdraw({
      tokenAddress: token,
      amount: BigInt(amount),
    })
  }

  async getTokenBalance(token: string) {
    return await nearNative.getTokenBalance({ contract: token })
  }

  async unwrapNear(amount: string) {
    return await nearNative.unwrapNear({ amount: amount })
  }

  async rebalanceRoute(route: any) {
    for (const transaction of route.transactions) {
      for (const action of transaction.actions) {
        await nearNative.callMethod({
          contract: transaction.receiverId,
          method: action.params.methodName,
          args: action.params.args,
          gas: action.params.gas,
          deposit: action.params.deposit,
        })
      }
    }
  }

  async placeMarketOrder(side: 'Bid' | 'Ask', price: number, quantity: number) {
    const order = {
      side: side,
      price: convertToDecimals(price, this.market.quote.decimal),
      quantity: convertToDecimals(quantity, this.market.base.decimal),
      market_order: false,
    }

    try {
      await nearNative.callMethod({
        method: 'batch_ops',
        args: {
          ops: [
            {
              market_id: this.market.id,
              drop: [],
              place: [order],
            },
          ],
          deadline: getDeadline(),
        },
      })
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }
}
