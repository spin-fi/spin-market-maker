import BigNumber from 'bignumber.js'
import config from '../configs/config.js'
import { spot } from '@spinfi/core'
import { GridOrders, SlopePoints } from './types.js'

export const DEFAULT_GAS = 100000000000000
export const NO_DEPOSIT = 0
export const DEFAULT_GAS_MAX = 300000000000000
export const DEFAULT_GAS_THIRTY = 30000000000000
export const DEFAULT_NEAR_AMOUNT_ON_ACCOUNT = 12
// export const DEFAULT_AMOUNT = '1250000000000000000000';
// export const DEFAULT_DEPOSIT = 1;
// export const ONE_YOCTO_NEAR = '0.000000000000000000000001';

export function declOfNum(number, words) {
  return words[
    number % 100 > 4 && number % 100 < 20 ? 2 : [2, 0, 1, 1, 1, 2][number % 10 < 5 ? Math.abs(number) % 10 : 5]
  ]
}
export function convertWithDecimals(value: string | number, decimal: string | number = 24): number {
  return new BigNumber(value).dividedBy(new BigNumber(10).pow(new BigNumber(decimal))).toNumber() || 0
}

export function convertToDecimals(value: string | number, decimal: string | number = 24): string {
  return new BigNumber(value).multipliedBy(new BigNumber(10).pow(new BigNumber(decimal))).toString() || '0'
}

export function sumOrdersNative(orders: spot.Order[]): string {
  if (!orders.length) {
    return '0'
  }

  return orders.reduce((sum, o) => new BigNumber(sum).plus(o.remaining).toString(), '0')
}

export function priceFromPool(base: number, baseDecimals: number, quote: number, quoteDecimals: number): number {
  const b = convertWithDecimals(base, baseDecimals)
  const q = convertWithDecimals(quote, quoteDecimals)
  return new BigNumber(b).dividedBy(new BigNumber(q)).toNumber() || 0
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// export function numbDiff(a: number, b: number) {
//   return 100 * Math.abs((a - b) / ((a + b) / 2));
// }

export function numbDiff(p1: number, p2: number) {
  return Math.abs(((p1 - p2) / p2) * 100)
}

function getSlopeIntercept(p: SlopePoints) {
  // y = mx + b
  const m = (p[2].y - p[1].y) / (p[2].x - p[1].x)
  const b = (p[1].y - m) * p[1].x
  return { m, b }
}
export function Floor(x: number, decimals: number) {
  const rounded = Math.pow(10, decimals)
  return Math.floor(x * rounded) / rounded
}

export function calculateGridOrders(
  currentPrice: number,
  baseBalance: number,
  quoteBalance: number,
  stepSize: number,
  tickSize: number,
  minBase: number,
  minQuote: number,
): GridOrders {
  const ask_spread = Math.abs(
    config.get('grid.ask_spread') === 0 ? config.get('grid.spread') : config.get('grid.ask_spread'),
  )
  const bid_spread = Math.abs(
    config.get('grid.bid_spread') === 0 ? config.get('grid.spread') : config.get('grid.bid_spread'),
  )
  const levels = Math.abs(config.get('grid.levels'))
  const levelsStep = Math.abs(config.get('grid.levels_step'))
  const sizeReversal = config.get('grid.size_reversal')

  if (sizeReversal < -0.999 || sizeReversal > 0.999) {
    throw Error('Wrong size_reversal param in config file. Min: -0.999, max: 0.999.')
  }

  const priceFixedRate = getFixedPoint(tickSize)
  const sizeFixedRate = getFixedPoint(stepSize)
  const askSpread = (currentPrice / 100) * ask_spread < tickSize / 2 ? tickSize / 2 : (currentPrice / 100) * ask_spread
  const bidSpread = (currentPrice / 100) * bid_spread < tickSize / 2 ? tickSize / 2 : (currentPrice / 100) * bid_spread

  const reversalPoints = {
    1: { x: 1, y: 1 + sizeReversal },
    2: { x: levels, y: 1 - sizeReversal },
  }

  const reversalIntercept = getSlopeIntercept(reversalPoints)
  const asksSizer = baseBalance / levels
  const bidsSizer = quoteBalance / levels
  const asks = []
  const bids = []

  for (let level = 0; level < levels; level++) {
    const bidPriceModifier = bidSpread + levelsStep * level
    const askPriceModifier = askSpread + levelsStep * level

    const sizeModifier = levels === 1 ? 1 : (level + 1) * reversalIntercept.m + reversalIntercept.b

    const askPrice = Floor(currentPrice + askPriceModifier, priceFixedRate)
    const askSize =
      config.get('market') === 'spot'
        ? Floor(sizeModifier * asksSizer, sizeFixedRate)
        : Floor((sizeModifier * asksSizer) / (currentPrice + askPriceModifier), sizeFixedRate)
    asks.push({ price: askPrice, size: askSize })

    const bidPrice = Floor(currentPrice - bidPriceModifier, priceFixedRate)
    const bidSize = Floor((sizeModifier * bidsSizer) / (currentPrice - bidPriceModifier), sizeFixedRate)
    bids.push({ price: bidPrice, size: bidSize })

    if (askSize < minBase || bidSize < minBase) {
      throw Error(
        `One of the orders size is lower than market min_base_quantity. Market min_base_quantity: ${minBase}. Order sizes: ask ${askSize}, bid ${bidSize}.`,
      )
    }

    if (askSize * askPrice < minQuote || bidSize * bidPrice < minQuote) {
      throw Error(
        `One of the orders size is lower than market min_quote_quantity. Market min_quote_quantity: ${minQuote}. Order totals: ask ${
          askSize * askPrice
        }, bid ${bidSize * bidPrice}.`,
      )
    }
  }

  return {
    asks: asks.reverse(),
    bids: bids,
  }
}

// ToDo: remove
export function getContractId(): string {
  const market = config.get('market')
  const network = config.get('network')

  if (market === 'spot') {
    if ('SPOT_CONTRACT_ID' in process.env) {
      return process.env.SPOT_CONTRACT_ID
    }

    return network === 'testnet' ? 'v1.spot.spin-fi.testnet' : 'spot.spin-fi.near'
  }

  if (market === 'perp') {
    if ('PERP_CONTRACT_ID' in process.env) {
      return process.env.PERP_CONTRACT_ID
    }

    return network === 'testnet' ? 'v2_0_2.perp.spin-fi.testnet' : 'v2_0_2.perp.spin-fi.near'
  }

  return '' // error on initialization
}

export function getNodeUrl(): string {
  const network = config.get('network')
  return network === 'testnet' ? 'https://rpc.testnet.near.org' : 'https://rpc.mainnet.near.org'
}

export function getDeadline() {
  return ((+new Date() + 60 * 1000) * 1_000_000).toString()
}

export function getFixedPoint(n: number): number {
  return n === 1 ? 0 : (n + '').split('.')[1].length
}

export function randomFloat(min: number, max: number, fixed = 2): number {
  return +(Math.random() * (max - min) + min).toFixed(fixed)
}
