interface BalanceInfoNative {
  balance: string
  available: string
  locked_in_orders: string
}

interface BalanceInfoFormatted {
  balance: number
  available: number
  locked_in_orders: number
}

interface Balance {
  token: string
  decimal: number
  native: BalanceInfoNative
  formatted: BalanceInfoFormatted
}

export interface Balances {
  base: Balance
  quote: Balance
}

type SlopePoint = {
  x: number
  y: number
}

export type SlopePoints = {
  1: SlopePoint
  2: SlopePoint
}

type GridOrder = {
  price: number
  size: number
}
export interface GridOrders {
  asks: GridOrder[]
  bids: GridOrder[]
}
