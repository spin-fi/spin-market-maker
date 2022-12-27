import logger from '../logger/index.js'
import { Client } from '../client/index.js'
import { PerkClient } from '../client/perk.js'
import { getLastPrice } from '../price/index.js'
import config from '../configs/config.js'
import {
  calculateGridOrders,
  convertToDecimals,
  convertWithDecimals,
  DEFAULT_NEAR_AMOUNT_ON_ACCOUNT,
  numbDiff,
} from '../client/utils.js'
import { Balance } from '../client/types.js'

const x = true

const perkRebalancer = new PerkClient()
export const GridBot = async () => {
  const SpinClient = new Client()
  const priceChangeTrigger = config.get('price.trigger')
  const inventoryUsage = Math.abs(config.get('grid.inventory_usage'))
  const maxBase = Math.abs(config.get('grid.max_base'))
  const maxQuote = Math.abs(config.get('grid.max_quote'))
  const triggerStrategy = config.get('trigger.trigger_strategy')
  const triggerCheckInterval = Math.abs(config.get('trigger.trigger_check_interval'))
  const levels = Math.abs(config.get('grid.levels'))
  const levelsTriggerCount = Math.abs(config.get('trigger.levels_trigger'))
  const rebalanceEnable = config.get('rebalance.enable')
  const rebalanceFromBase = Math.abs(config.get('rebalance.from_base'))
  const rebalanceFromQuote = Math.abs(config.get('rebalance.from_quote'))
  const rebalanceCheckInterval = Math.abs(config.get('rebalance.rebalance_check_interval'))

  let lastPrice = 0
  let placingInProgress = false

  if (inventoryUsage > 1) {
    throw Error('Wrong inventory_usage param in config file. Min: 0, max: 1.')
  }

  if (levelsTriggerCount <= 0) {
    throw new Error('trigger.levels_trigger must be above zero.')
  }

  if (levelsTriggerCount > levels) {
    throw new Error('trigger.levels_trigger must must be less than or equal to grid.levels.')
  }

  if (!Number.isSafeInteger(levelsTriggerCount)) {
    throw new Error('trigger.levels_trigger must be integer.')
  }

  async function orderPlacing(trigger_event: string, price: number) {
    logger.info('')
    logger.info(trigger_event)
    placingInProgress = true

    if (!config.get('batched')) {
      await SpinClient.cancelAllOrders()
    }

    const balances = await SpinClient.getBalances(true)

    const baseSize =
      maxBase === 0
        ? (balances.base.formatted.available + balances.base.formatted.locked_in_orders) * inventoryUsage
        : maxBase >= balances.base.formatted.available + balances.base.formatted.locked_in_orders
        ? (balances.base.formatted.available + balances.base.formatted.locked_in_orders) * inventoryUsage
        : maxBase * inventoryUsage

    const quoteSize =
      maxQuote === 0
        ? (balances.quote.formatted.available + balances.quote.formatted.locked_in_orders) * inventoryUsage
        : maxQuote >= balances.quote.formatted.available + balances.quote.formatted.locked_in_orders
        ? (balances.quote.formatted.available + balances.quote.formatted.locked_in_orders) * inventoryUsage
        : maxQuote * inventoryUsage

    const orders = calculateGridOrders(
      price,
      baseSize,
      quoteSize,
      SpinClient.step_size,
      SpinClient.tick_size,
      SpinClient.min_base_size,
      SpinClient.min_quote_size,
    )

    try {
      config.get('batched')
        ? await SpinClient.cancelAndBatchOpsPlacing(orders)
        : await SpinClient.batchOpsPlacing(orders)
    } catch (error) {
      logger.error('Error during batchOps')
    }

    logger.info('Orders placed. Waiting for the triggers...')
    placingInProgress = false
  }

  async function priceLoop() {
    async function execution() {
      const spinMarket = await SpinClient.getMarket()
      const newPrice = await getLastPrice(spinMarket)

      if (numbDiff(lastPrice, newPrice) >= priceChangeTrigger && !placingInProgress) {
        logger.info(`Last price: ${lastPrice.toFixed(4)}, new price: ${newPrice.toFixed(4)}`)

        logger.info(
          `Next price trigger: >= ${(newPrice + (newPrice / 100) * priceChangeTrigger).toFixed(4)} or <= ${(
            newPrice -
            (newPrice / 100) * priceChangeTrigger
          ).toFixed(4)}`,
        )

        lastPrice = newPrice
        if (x) await orderPlacing('New price trigger event', newPrice)
      }
    }
    await execution()
    logger.info(`Watching PRICE CHANGE for >= ${priceChangeTrigger}%`)
    setInterval(async () => await execution(), Math.abs(config.get('price.source_check_interval')))
  }

  async function triggersLoop() {
    logger.info(`Trigger strategy: ${triggerStrategy}`)

    async function levelsTriggerExecution() {
      const triggerNumber = levels - levelsTriggerCount
      const orders = await SpinClient.getOrders()
      const asks = orders.filter((o) => o.o_type === 'Ask')
      const bids = orders.filter((o) => o.o_type === 'Bid')

      if ((asks.length <= triggerNumber || bids.length <= triggerNumber) && !placingInProgress) {
        const spinMarket = await SpinClient.getMarket()
        const currentPrice = await getLastPrice(spinMarket)
        if (x) await orderPlacing('New levels trigger event', currentPrice)
      }
    }

    switch (triggerStrategy) {
      case 'none':
        break

      case 'levels':
        logger.info(`Watching LEVELS CHANGE >= ${levelsTriggerCount}. Current levels: ${levels}`)
        await levelsTriggerExecution()
        setInterval(async () => await levelsTriggerExecution(), triggerCheckInterval)
        break
    }
  }

  async function rebalanceLoop() {
    let rebalanceInProcess = false

    async function rebalance(tokenA: Balance, tokenB: Balance) {
      rebalanceInProcess = true
      placingInProgress = true

      logger.info(`Withdrawing ${tokenA.token} ${tokenA.formatted.available}`)
      await SpinClient.withdraw(tokenA.token, tokenA.native.available)

      const rebalanceTokenBalance = await SpinClient.getTokenBalance(tokenA.token)
      const route = await perkRebalancer.getRoute({
        input: tokenA.token === 'near.near' ? 'wrap.near' : tokenA.token,
        output: tokenB.token === 'near.near' ? 'wrap.near' : tokenB.token,
        amount:
          tokenA.token === 'near.near'
            ? convertToDecimals(
                convertWithDecimals(rebalanceTokenBalance, tokenA.decimal) - DEFAULT_NEAR_AMOUNT_ON_ACCOUNT,
                tokenA.decimal,
              )
            : rebalanceTokenBalance,
      })

      logger.info(`Swaping ${tokenA.token} —> ${tokenB.token}`)
      await SpinClient.rebalanceRoute(route)

      if (tokenB.token === 'near.near') {
        const rebalancedTokenBalance = await SpinClient.getTokenBalance(
          tokenB.token === 'near.near' ? 'wrap.near' : tokenB.token,
        )
        await SpinClient.unwrapNear(rebalancedTokenBalance)
      }

      let baseTokenBalance = await SpinClient.getTokenBalance(tokenB.token === 'near.near' ? 'near' : tokenB.token)

      baseTokenBalance =
        tokenB.token === 'near.near'
          ? convertToDecimals(
              convertWithDecimals(baseTokenBalance, tokenB.decimal) - DEFAULT_NEAR_AMOUNT_ON_ACCOUNT,
              tokenB.decimal,
            )
          : baseTokenBalance

      logger.info(`Depositing ${tokenB.token} ${convertWithDecimals(baseTokenBalance, tokenB.decimal)}`)
      await SpinClient.deposit(tokenB.token === 'near.near' ? 'near' : tokenB.token, baseTokenBalance)
    }

    async function rebalanceTriggerExecution() {
      if (!placingInProgress && !rebalanceInProcess) {
        const balances = await SpinClient.getBalances(true)

        if (balances.base.formatted.balance >= maxBase + rebalanceFromBase) {
          logger.info('Base rebalance event!')
          await rebalance(balances.base, balances.quote)
        }

        if (balances.quote.formatted.balance >= maxQuote + rebalanceFromQuote) {
          logger.info('Quote rebalance event!')
          await rebalance(balances.quote, balances.base)
        }

        if (rebalanceInProcess) {
          rebalanceInProcess = false
          const spinMarket = await SpinClient.getMarket()
          const currentPrice = await getLastPrice(spinMarket)
          if (x) await orderPlacing('New rebalance trigger event', currentPrice)
          placingInProgress = false
        }
      }
    }

    if (rebalanceEnable) {
      logger.info(`Rebalance enable!`)
      await rebalanceTriggerExecution()
      setInterval(async () => await rebalanceTriggerExecution(), rebalanceCheckInterval)
    }
  }

  try {
    await SpinClient.init()
    await priceLoop()
    await triggersLoop()
    await rebalanceLoop()
  } catch (err) {
    logger.error(err)
    throw err
  }
}
