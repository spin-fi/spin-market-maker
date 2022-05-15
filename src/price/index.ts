import config from '../configs/config.js';
import { WebsocketUpdates } from './ccxws.js';
import { RefPricer } from './ref.js';

const watcher = new WebsocketUpdates();
const refWatcher = new RefPricer();
export async function getLastPrice(): Promise<number> {
  const priceSource = config.get('price.source');

  if (['binance', 'ftx'].includes(priceSource)) {
    return await watcher.getPrice();
  }

  if (priceSource === 'ref') {
    return await refWatcher.getPrice();
  }

  return 0;
}
