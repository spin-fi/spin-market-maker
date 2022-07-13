import { createApi, Api } from '@spinfi/node'
import { Spin, Order, USide } from '@spinfi/core'
import config from '../configs/config.js'
import logger from '../logger/index.js'
import { GridOrders, PerpMarket, PerpBaseCurrency, PerpBalance } from './types.js'
import BigNumber from 'bignumber.js'
import {
  convertToDecimals,
  convertWithDecimals,
  declOfNum,
  getContractId,
  getDeadline,
  // sumOrdersNative,
} from './utils.js'

BigNumber.set({ EXPONENTIAL_AT: 30 })

export class PerpClient {
  private api: Api
  private spin: Spin
  private market: PerpMarket
  private balances: PerpBalance
  tick_size: number
  step_size: number
  min_base_size: number
  min_quote_size: number
  contract_id: string
  decimal: number
  leverage: number

  constructor() {
    this.api
    this.spin
    this.market
    this.balances
    this.tick_size
    this.step_size
    this.min_base_size
    this.min_quote_size
    this.decimal = 24
    this.leverage = 1
  }

  async init(): Promise<void> {
    this.api = await createApi({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      network: config.get('network'),
      accountId: config.get('account_id'),
      privateKey: config.get('private_key'),
      contractId: getContractId(),
    })
    this.contract_id = getContractId()
    this.spin = await this.api.spin
    this.market = await this.setMarket()
    this.balances = await this.setBalances()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async viewFunction(method: string, args: any) {
    return await await this.api.account.viewFunction(this.contract_id, method, args)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async callFunction(method: string, args: any, gas = '300000000000000', attachedDeposit: string = undefined) {
    return await await this.api.account.functionCall({
      contractId: this.contract_id,
      methodName: method,
      args: args,
      gas: gas,
      attachedDeposit: attachedDeposit,
    })
  }

  private async setMarket() {
    try {
      const market: PerpMarket = await this.viewFunction('get_market', { market_id: config.get('grid.market_id') })

      this.tick_size = convertWithDecimals(market.limits.tick_size, this.decimal)

      this.step_size = convertWithDecimals(market.limits.step_size, this.decimal)

      this.min_base_size = convertWithDecimals(market.limits.min_base_quantity, this.decimal)

      this.min_quote_size = convertWithDecimals(market.limits.min_quote_quantity, this.decimal)

      this.leverage = convertWithDecimals(market.leverage, this.decimal)

      if (config.get('grid.levels_step') < this.tick_size) {
        throw Error(
          `Levels Step in configuration is lower than market step size. Increase it, or make equal. Levels Step Size: ${config.get(
            'grid.levels_step',
          )}. Market Step Size: ${this.tick_size}`,
        )
      }

      return market
    } catch (error) {
      logger.error(error, 'Cant load market')
      throw Error('Cant sync market')
    }
  }

  async getOrders(): Promise<Order[]> {
    try {
      return await this.viewFunction('get_orders', {
        market_id: this.market.id,
        account_id: config.get('account_id'),
      })
    } catch (error) {
      logger.error(error)
      return []
    }
  }

  private async setBalances(): Promise<PerpBalance> {
    const baseCurrency: PerpBaseCurrency = await this.viewFunction('get_base_currency', {})
    const balance: string = await this.viewFunction('get_balance', { account_id: config.get('account_id') })
    // const accountOrders = await this.getOrders()

    const bRaw: PerpBalance = {
      base: {
        token: baseCurrency.symbol,
        decimal: baseCurrency.decimals,
        formatted: {
          balance: 0,
          available: 0,
          locked_in_orders: 0,
        },
        native: {
          available: balance,
          balance: '0',
          // locked_in_orders: sumOrdersNative(accountOrders.filter((o) => o.o_type === USide.Ask)),
          locked_in_orders: '0',
        },
      },
      // quote: {
      //   token: this.market.quote.address,
      //   decimal: this.market.quote.decimal,
      //   formatted: {
      //     balance: 0,
      //     available: 0,
      //     locked_in_orders: 0,
      //   },
      //   native: {
      //     available: this.market.quote.address in depositsRaw ? depositsRaw[this.market.quote.address] : '0',
      //     balance: '0',
      //     locked_in_orders: accountOrders
      //       .filter((o) => o.o_type === USide.Bid)
      //       .reduce(
      //         (sum, o) =>
      //           new BigNumber(sum)
      //             .plus(
      //               new BigNumber(o.price).multipliedBy(
      //                 new BigNumber(o.remaining).dividedBy(
      //                   new BigNumber(10).pow(new BigNumber(this.market.base.decimal)),
      //                 ),
      //               ),
      //             )
      //             .toString() || '0',
      //         '0',
      //       ),
      //   },
      // },
    }

    bRaw.base.native.balance = new BigNumber(bRaw.base.native.available)
      .plus(bRaw.base.native.locked_in_orders)
      .toString()

    // bRaw.quote.native.balance = new BigNumber(bRaw.quote.native.available).plus(bRaw.quote.native.locked_in_orders).toString()

    bRaw.base.formatted = {
      balance: convertWithDecimals(bRaw.base.native.balance, bRaw.base.decimal),
      available: convertWithDecimals(bRaw.base.native.available, bRaw.base.decimal),
      locked_in_orders: convertWithDecimals(bRaw.base.native.locked_in_orders, bRaw.base.decimal),
    }

    // bRaw.quote.formatted = {balance: convertWithDecimals(bRaw.quote.native.balance, bRaw.quote.decimal),available: convertWithDecimals(bRaw.quote.native.available, bRaw.quote.decimal),locked_in_orders: convertWithDecimals(bRaw.quote.native.locked_in_orders, bRaw.quote.decimal),}
    logger.info('Current available balance, locked in orders, total with leverage: ')
    logger.info(
      `${baseCurrency.symbol} — ${bRaw.base.formatted.available}, ${bRaw.base.formatted.locked_in_orders}, ${bRaw.base.formatted.balance}`,
    )
    // logger.info(
    //   `${this.market.quote.symbol} — ${bRaw.quote.formatted.available}, ${bRaw.quote.formatted.locked_in_orders}, ${bRaw.quote.formatted.balance}`,
    // )
    return bRaw
  }

  async cancelAllOrders() {
    const orders = await this.getOrders()
    const ordersLength = orders.length
    if (!ordersLength) return null

    logger.info(`Cancelling ${orders.length} ${declOfNum(ordersLength, ['order', 'orders', 'orders'])}...`)

    try {
      await this.callFunction('cancel_orders', {
        market_id: this.market.id,
        deadline: getDeadline(),
      })
      logger.info(`Orders canceled on market #${this.market.id}`)
    } catch (error) {
      logger.error(error, `Error with cancelling orders on market #${this.market.id}`)

      throw Error('Error with cancelling orders')
    }
  }

  async getbalances(updateBalances = false) {
    if (updateBalances) {
      return await this.setBalances()
    }

    return this.balances
  }

  async batchOpsPlacing(orders: GridOrders) {
    const bidOrders = orders.bids.map((o) => ({
      order_type: USide.Bid,
      price: convertToDecimals(o.price, this.decimal),
      quantity: convertToDecimals(o.size, this.decimal),
      market_order: false,
    }))

    const askOrders = orders.asks.map((o) => ({
      order_type: USide.Ask,
      price: convertToDecimals(o.price, this.decimal),
      quantity: convertToDecimals(o.size, this.decimal),
      market_order: false,
    }))

    logger.info('Placing orders via batchOps')

    try {
      await this.callFunction('batch_ops', {
        ops: [
          {
            market_id: this.market.id,
            drop: [],
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            place: [...bidOrders, ...askOrders],
          },
        ],
        deadline: getDeadline(),
      })
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }

  async cancelAndBatchOpsPlacing(orders: GridOrders) {
    const userOrdersRaw = await this.getOrders()
    const userOrdersIds = userOrdersRaw.map((o) => o.id)
    const bidOrders = orders.bids.map((o) => ({
      order_type: USide.Bid,
      price: convertToDecimals(o.price, this.decimal),
      quantity: convertToDecimals(o.size, this.decimal),
      market_order: false,
    }))

    const askOrders = orders.asks.map((o) => ({
      order_type: USide.Ask,
      price: convertToDecimals(o.price, this.decimal),
      quantity: convertToDecimals(o.size, this.decimal),
      market_order: false,
    }))

    logger.info('Canceling and placing orders via batchOps')

    try {
      await this.callFunction('batch_ops', {
        ops: [
          {
            market_id: this.market.id,
            drop: userOrdersIds,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            place: [...bidOrders, ...askOrders],
          },
        ],
        deadline: getDeadline(),
      })
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }
}
