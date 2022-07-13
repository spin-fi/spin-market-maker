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

export interface PerpMarket {
  id: number
  symbol: string
  leverage: string
  fees: {
    maker_fee: string
    taker_fee: string
    decimals: number
    is_rebate: boolean
  }
  availability: {
    allow_place: boolean
    allow_cancel: boolean
  }
  limits: {
    tick_size: string
    step_size: string
    min_base_quantity: string
    max_base_quantity: string
    min_quote_quantity: string
    max_quote_quantity: string
    max_bid_count: number
    max_ask_count: number
    max_match_count: number
  }
}

export interface PerpBalance {
  base: Balance
}

export type PerpBaseCurrency = {
  address: string
  decimals: number
  symbol: string
  max_deposit: string
}
