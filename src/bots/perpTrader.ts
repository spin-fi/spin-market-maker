import logger from '../logger/index.js'
import { PerpClient } from '../client/perp.js'
import config from '../configs/config.js'
import { USide } from '@spinfi/core'
import { convertToDecimals, convertWithDecimals, getFixedPoint, randomFloat, sleep } from '../client/utils.js'
import BigNumber from 'bignumber.js'

export const PerpTraderBot = async () => {
  const SpinClient = new PerpClient()
  const tradeStyle = config.get('trader.trade_style')
  const minTradeSize = Math.abs(config.get('trader.trade_min_size'))
  const maxTradeSize = Math.abs(config.get('trader.trade_max_size'))
  const minSleepInterval = Math.abs(config.get('trader.trade_min_interval'))
  const maxSleepInterval = Math.abs(config.get('trader.trade_max_interval'))
  const sideMap = new Map([
    [true, USide.Ask],
    [false, USide.Bid],
  ])
  const obMap = new Map([
    [true, 'bid_orders'],
    [false, 'ask_orders'],
  ])

  let placingInProgress = false
  let tradeAlternateSide = true

  async function orderPlacing(trigger_event: string, price: number, size: number, side: USide) {
    logger.info('')
    logger.info(trigger_event)
    logger.info(`${side} ${convertWithDecimals(price)}@${size} order placing...`)

    try {
      await SpinClient.placeMarketOrder(side, convertWithDecimals(price), size)
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
      const randomSize = randomFloat(minTradeSize, maxTradeSize, getFixedPoint(SpinClient.step_size))
      const orderPrice = ob[obMap.get(side)][0]?.price
      const orderSize =
        new BigNumber(convertToDecimals(randomSize)).comparedTo(new BigNumber(ob[obMap.get(side)][0]?.quantity)) === 1
          ? convertWithDecimals(ob[obMap.get(side)][0]?.quantity)
          : randomSize

      await orderPlacing('New trade time trigger event', orderPrice, orderSize, sideMap.get(side))

      const sleepTime = randomFloat(minSleepInterval, maxSleepInterval, 0)
      logger.info(`Sleeping for ${(sleepTime / 1000).toFixed(1)} seconds.`)
      await sleep(sleepTime)
      await execution()
    }
    logger.info(`Trade style (side): ${tradeStyle}`)
    await execution()
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
