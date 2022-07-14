import { Ticker, BinanceClient, FtxClient, BinanceFuturesUsdtmClient } from 'ccxws'
import { sleep } from '../client/utils.js'
import config from '../configs/config.js'
import logger from '../logger/index.js'

export class WebsocketUpdates {
  private price: number
  private client: FtxClient | BinanceClient | BinanceFuturesUsdtmClient
  private initialized: boolean

  constructor() {
    this.price = 0
    this.client
    this.initialized = false
  }

  private setPrice(newPrice: number): void {
    this.price = newPrice
  }

  init(): void {
    const source = config.get('price.source').toLowerCase()
    const sourceTicker = config.get('price.source_ticker').toUpperCase()
    const market = config.get('market')
    const marketType = market === 'spot' ? 'spot' : 'futures'
    const ticker = sourceTicker.split(market === 'spot' ? '/' : '-')
    const base = ticker[0]
    const quote = ticker[1]

    switch (source) {
      case 'ftx':
        this.client = new FtxClient()
        break

      case 'binance':
        this.client = market === 'spot' ? new BinanceClient() : new BinanceFuturesUsdtmClient()
        break
    }

    this.client.on('connected', () => logger.info(`Connected to ${source.toUpperCase()} — ${sourceTicker} websocket`))

    this.client.on('disconnect', () => logger.info(`Disconnected from websocket. Reconnecting...`))

    this.client.on('ticker', async (ticker: Ticker) => this.setPrice(+ticker.last))

    this.client.subscribeTicker({
      id: source === 'ftx' ? sourceTicker : sourceTicker.replace('/', ''),
      base: base,
      quote: quote,
      type: marketType,
    })

    this.initialized = true
  }

  async getPrice(): Promise<number> {
    if (!this.initialized) {
      this.init()
    }

    if (this.price === 0) {
      await sleep(250)
      return this.getPrice()
    }

    return this.price
  }
}
