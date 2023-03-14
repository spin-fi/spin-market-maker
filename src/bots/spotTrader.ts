import logger from '../logger/index.js'
import { Client } from '../client/index.js'
import config from '../configs/config.js'
import { convertToDecimals, convertWithDecimals, getFixedPoint, randomFloat } from '../client/utils.js'
import BigNumber from 'bignumber.js'

export const SpotTraderBot = async () => {
  const SpinClient = new Client()
  const tradeStyle = config.get('trader.trade_style')
  const minTradeSize = config.get('trader.trade_min_size')
  const maxTradeSize = config.get('trader.trade_max_size')

  const sideMap: Map<boolean, 'Ask' | 'Bid'> = new Map([
    [true, 'Ask'],
    [false, 'Bid'],
  ])

  const obMap: Map<boolean, 'bid_orders' | 'ask_orders'> = new Map([
    [true, 'bid_orders'],
    [false, 'ask_orders'],
  ])

  let placingInProgress = false
  let tradeAlternateSide = true

  async function orderPlacing(trigger_event: string, price: number, size: number, side: 'Bid' | 'Ask') {
    logger.info('')
    logger.info(trigger_event)
    logger.info(`${side} ${price}@${size} order placing...`)

    try {
      await SpinClient.placeMarketOrder(side, price, size)
    } catch (error) {
      logger.info('Order not placed. Oops!')
      logger.error(error)
    }

    logger.info(`Waiting for the triggers...`)
    placingInProgress = false
    tradeAlternateSide = !tradeAlternateSide
  }

  async function tradeLoop() {
    async function execution() {
      if (placingInProgress) return

      let side = tradeAlternateSide

      if (tradeStyle === 'random') {
        side = Math.random() < 0.5
      }

      placingInProgress = true

      const ob = await SpinClient.getL1()
      const spinMarket = await SpinClient.getMarket()
      const randomSize = randomFloat(minTradeSize, maxTradeSize, getFixedPoint(SpinClient.step_size))
      const orderPrice = ob[obMap.get(side)][0]?.price

      const orderSize =
        new BigNumber(convertToDecimals(randomSize, spinMarket.base.decimal)).comparedTo(
          new BigNumber(ob[obMap.get(side)][0]?.quantity),
        ) === 1
          ? convertWithDecimals(ob[obMap.get(side)][0]?.quantity, spinMarket.base.decimal)
          : randomSize

      await orderPlacing(
        'New trade time trigger event',
        convertWithDecimals(orderPrice, spinMarket.quote.decimal),
        orderSize,
        sideMap.get(side),
      )
    }

    await execution()

    setInterval(async () => await execution(), Math.abs(config.get('trader.trade_interval')))
  }

  try {
    await SpinClient.init()
    await tradeLoop()
  } catch (err) {
    logger.error(err)
    throw err
  }
}
//
