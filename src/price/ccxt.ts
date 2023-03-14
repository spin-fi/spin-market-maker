import ccxt from 'ccxt'
import { sleep } from '../client/utils.js'
import config from '../configs/config.js'

export class WebsocketUpdates {
  private price: number
  private client
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

    switch (source) {
      case 'binance':
        this.client = new ccxt.pro.binance()
        break

      case 'kucoin':
        this.client = new ccxt.pro.kucoin()
        break

      case 'okx':
        this.client = new ccxt.pro.okx()
        break
    }

    if (this.client.has['watchTicker']) {
      this.client.loadMarkets().then(() => {
        this.loop(sourceTicker)
      })
    } else {
      console.log(this.client.id, 'does not support watchTicker yet')
    }

    this.initialized = true
  }

  async loop(symbol) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const ticker = await this.client.watchTicker(symbol)
        this.setPrice(ticker['last'])
      } catch (e) {
        console.log(symbol, e)
      }
    }
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
