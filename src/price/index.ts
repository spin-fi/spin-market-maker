import config from '../configs/config.js'
import { WebsocketUpdates } from './ccxws.js'
import { RefPricer } from './ref.js'
import { JumboPricer } from './jumbo.js'
import BigNumber from 'bignumber.js'

const watcher = new WebsocketUpdates()
const refWatcher = new RefPricer()
const secondRefWatcher = new RefPricer()
const jumboWatcher = new JumboPricer()

export async function getLastPrice(): Promise<number> {
  const priceSource = config.get('price.source')

  if (['binance', 'ftx'].includes(priceSource)) {
    return await watcher.getPrice()
  }

  if (priceSource === 'ref') {
    const poolId = +config.get('price.source_ticker').split(', ')[0]
    const secondPoolId = +config.get('price.source_ticker').split(', ')[1] || 0

    if (!secondPoolId) {
      return await refWatcher.getPrice(poolId)
    } else {
      const pool_1_price = await refWatcher.getPrice(poolId)
      const pool_2_price = await secondRefWatcher.getPrice(secondPoolId)
      return new BigNumber(pool_2_price).div(new BigNumber(pool_1_price)).toNumber()
    }
  }

  if (priceSource === 'jumbo') {
    const poolId = +config.get('price.source_ticker').split(', ')[0]
    // nearX
    const nearXPrice = await jumboWatcher.getPrice(poolId, true)
    const nearPrice = await refWatcher.getPrice(3)
    return new BigNumber(nearXPrice).multipliedBy(new BigNumber(nearPrice)).toNumber()
  }

  return 0
}
