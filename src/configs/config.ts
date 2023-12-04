import convict from 'convict'

const config = convict({
  env: {
    doc: 'The application environment',
    format: ['production', 'development'],
    default: 'development',
    env: 'NODE_ENV',
  },
  logging_level: {
    doc: 'The logging level to print to the console',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
    env: 'LOGGING_LEVEL',
  },
  private_key: {
    doc: 'NEAR account private key',
    format: String,
    default: '',
  },
  account_id: {
    doc: 'NEAR account ID',
    format: String,
    default: '',
  },
  network: {
    doc: 'NEAR network',
    format: ['testnet', 'mainnet'],
    default: 'testnet',
  },
  batched: {
    doc: 'Batched Transactions',
    format: [true, false],
    default: false,
  },
  market: {
    doc: 'Spot / Perp / ...',
    format: ['spot', 'perp'],
    default: 'spot',
  },
  grid: {
    market_id: {
      doc: 'Spin Market Id',
      format: Number,
      default: 1,
    },
    max_base: {
      doc: 'Max Base quantity usage from your account',
      format: Number,
      default: 0,
    },
    max_quote: {
      doc: 'Max Base quantity usage from your account',
      format: Number,
      default: 0,
    },
    inventory_usage: {
      doc: 'Account assets coeficient for order placement',
      format: Number,
      default: 0.5,
    },
    spread: {
      doc: 'Bid-Ask Spread percentage',
      format: Number,
      default: 1, // 1%
    },
    ask_spread: {
      doc: 'Ask Spread percentage',
      format: Number,
      default: 0.5, // 1%
    },
    bid_spread: {
      doc: 'Bid Spread percentage',
      format: Number,
      default: 0.5, // 1%
    },
    levels: {
      doc: 'Amount of levels to be placed for both sides',
      format: Number,
      default: 3,
    },
    levels_step: {
      doc: 'Diff between orders',
      format: Number,
      default: 0.1,
    },
    size_reversal: {
      doc: 'Orders size reversal',
      format: Number,
      default: 0,
    },
  },
  price: {
    source: {
      doc: 'Price source for watching',
      format: ['ref', 'binance', 'kucoin', 'okx'],
      default: 'binance',
    },
    source_ticker: {
      doc: 'Price source for watching',
      format: String,
      default: 'NEAR/USDT',
    },
    source_check_interval: {
      doc: 'Price source check interval in ms',
      format: Number,
      default: 3000, // 3 seconds
    },
    trigger: {
      doc: 'Price change trigger in %',
      format: Number,
      default: 1, // 1%
    },
  },
  trigger: {
    trigger_strategy: {
      doc: 'Additional trigger strategies',
      format: ['none', 'levels'],
      default: 'none',
    },
    levels_trigger: {
      doc: 'Amount of levels filled, when trigger order placing',
      format: Number,
      default: 1,
    },
    trigger_check_interval: {
      doc: 'Trigger source check interval',
      format: Number,
      default: 5000, // 5 seconds
    },
  },
  rebalance: {
    enable: {
      doc: 'Enable rebalancing using Perk Aggregator + Ref',
      format: Boolean,
      default: false,
    },
    from_base: {
      doc: 'Minimum amount of base currency to start rebalance process',
      format: Number,
      default: 1,
    },
    from_quote: {
      doc: 'Minimum amount of quote currency to start rebalance process',
      format: Number,
      default: 1,
    },
    rebalance_check_interval: {
      doc: 'Rebalance check interval',
      format: Number,
      default: 5000, // 5 seconds
    },
  },
  // Dev only
  trader: {
    enable: {
      doc: '...',
      format: [true, false],
      default: false,
    },
    trade_interval: {
      doc: '...',
      format: Number,
      default: 1000, // 1 second
    },
    trade_style: {
      doc: '...',
      format: ['random', 'alternate'],
      default: 'random',
    },
    trade_min_size: {
      doc: '...',
      format: Number,
      default: 0.1,
    },
    trade_max_size: {
      doc: '...',
      format: Number,
      default: 1,
    },
  },
})

export type Config = typeof config

export default config
