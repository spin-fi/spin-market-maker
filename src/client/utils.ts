import BigNumber from 'bignumber.js';
import { getPrestable, getStable } from '@spinfi/shared';
import config from '../configs/config.js';
import { Order } from '@spinfi/core';
import { GridOrders, SlopePoints } from './types.js';

export function declOfNum(number, words) {
  return words[
    number % 100 > 4 && number % 100 < 20
      ? 2
      : [2, 0, 1, 1, 1, 2][number % 10 < 5 ? Math.abs(number) % 10 : 5]
  ];
}
export function convertWithDecimals(
  value: string | number,
  decimal: string | number,
): number {
  return (
    new BigNumber(value)
      .dividedBy(new BigNumber(10).pow(new BigNumber(decimal)))
      .toNumber() || 0
  );
}
export function convertToDecimals(
  value: string | number,
  decimal: string | number,
): string {
  return (
    new BigNumber(value)
      .multipliedBy(new BigNumber(10).pow(new BigNumber(decimal)))
      .toString() || '0'
  );
}

export function sumOrdersNative(orders: Order[]): string {
  if (!orders.length) {
    return '0';
  }

  return orders.reduce(
    (sum, o) => new BigNumber(sum).plus(o.remaining).toString(),
    '0',
  );
}

export function getContractID(): string {
  const network = config.get('network');
  const stage = network === 'testnet' ? getPrestable() : getStable();
  return stage.contractId;
}

export function priceFromPool(
  base: number,
  baseDecimals: number,
  quote: number,
  quoteDecimals: number,
): number {
  const b = convertWithDecimals(base, baseDecimals);
  const q = convertWithDecimals(quote, quoteDecimals);
  return new BigNumber(b).dividedBy(new BigNumber(q)).toNumber() || 0;
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// export function numbDiff(a: number, b: number) {
//   return 100 * Math.abs((a - b) / ((a + b) / 2));
// }

export function numbDiff(p1: number, p2: number) {
  return Math.abs(((p1 - p2) / p2) * 100);
}

function getSlopeIntercept(p: SlopePoints) {
  // y = mx + b
  const m = (p[2].y - p[1].y) / (p[2].x - p[1].x);
  const b = (p[1].y - m) * p[1].x;
  return { m, b };
}
export function Floor(x: number, decimals: number) {
  const rounded = Math.pow(10, decimals);
  return Math.floor(x * rounded) / rounded;
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
  const spread = config.get('grid.spread');
  const levels = config.get('grid.levels');
  const levelsStep = config.get('grid.levels_step');
  const sizeReversal = config.get('grid.size_reversal');

  const priceFixedRate = (tickSize + '').split('.')[1].length;
  const sizeFixedRate = (stepSize + '').split('.')[1].length;

  const halfSpread = (currentPrice / 100) * (spread / 2);

  const reversalPoints = {
    1: { x: 1, y: 1 + sizeReversal },
    2: { x: levels, y: 1 - sizeReversal },
  };

  const reversalIntercept = getSlopeIntercept(reversalPoints);
  const asksSizer = baseBalance / levels;
  const bidsSizer = quoteBalance / levels;
  const asks = [];
  const bids = [];

  for (let index = 0; index < levels; index++) {
    const priceModifier = halfSpread + levelsStep * index;
    const sizeModifier =
      levels === 1
        ? 1
        : (index + 1) * reversalIntercept.m + reversalIntercept.b;

    const askPrice = Floor(currentPrice + priceModifier, priceFixedRate);
    const askSize = Floor(sizeModifier * asksSizer, sizeFixedRate);
    asks.push({ price: askPrice, size: askSize });

    const bidPrice = Floor(currentPrice - priceModifier, priceFixedRate);
    const bidSize = Floor(
      (sizeModifier * bidsSizer) / (currentPrice - priceModifier),
      sizeFixedRate,
    );
    bids.push({ price: bidPrice, size: bidSize });

    if (askSize < minBase || bidSize < minBase) {
      throw Error(
        `One of the orders size is lower than market min_base_quantity. Market min_base_quantity: ${minBase}. Order sizes: ask ${askSize}, bid ${bidSize}.`,
      );
    }

    if (askSize * askPrice < minQuote || bidSize * bidPrice < minQuote) {
      throw Error(
        `One of the orders size is lower than market min_quote_quantity. Market min_quote_quantity: ${minQuote}. Order totals: ask ${
          askSize * askPrice
        }, bid ${bidSize * bidPrice}.`,
      );
    }
  }

  return {
    asks: asks.reverse(),
    bids: bids,
  };
}
