import { Ticker, BinanceClient, FtxClient } from 'ccxws';
import { sleep } from '../client/utils.js';
import config from '../configs/config.js';
import logger from '../logger/index.js';

export class WebsocketUpdates {
  private price: number;
  private client: FtxClient | BinanceClient;
  private initialized: boolean;

  constructor() {
    this.price = 0;
    this.client;
    this.initialized = false;
  }

  private setPrice(newPrice: number): void {
    this.price = newPrice;
  }

  init(): void {
    const source = config.get('price.source');
    const sourceTicker = config.get('price.source_ticker').toUpperCase();

    this.client = source === 'ftx' ? new FtxClient() : new BinanceClient();

    this.client.on('connected', () =>
      logger.info(
        `Connected to ${source.toUpperCase()} — ${sourceTicker} websocket`,
      ),
    );

    this.client.on('disconnect', () =>
      logger.info(`Disconnected from websocket. Reconnecting...`),
    );

    this.client.on('ticker', async (ticker: Ticker) =>
      this.setPrice(+ticker.last),
    );

    this.client.subscribeTicker({
      id: source === 'ftx' ? sourceTicker : sourceTicker.replace('/', ''),
      base: sourceTicker.split('/')[0],
      quote: sourceTicker.split('/')[1],
      type: 'spot',
    });

    this.initialized = true;
  }

  async getPrice(): Promise<number> {
    if (!this.initialized) {
      this.init();
    }

    if (this.price === 0) {
      await sleep(250);
      return this.getPrice();
    }

    return this.price;
  }
}
