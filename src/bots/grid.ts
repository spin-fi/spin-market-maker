import logger from '../logger/index.js';
import { Client } from '../client/index.js';
import { getLastPrice } from '../price/index.js';
import config from '../configs/config.js';
import { calculateGridOrders, numbDiff, sleep } from '../client/utils.js';

export const GridBot = async () => {
  const SpinClient = new Client();
  const priceChangeTrigger = config.get('price.trigger');
  const inventoryUsage = Math.abs(config.get('grid.inventory_usage'));
  const maxBase = Math.abs(config.get('grid.max_base'));
  const maxQuote = Math.abs(config.get('grid.max_quote'));

  if (inventoryUsage > 1) {
    throw Error('Wrong inventory_usage param in config file. Min: 0, max: 1.');
  }

  let lastPrice = 0;

  try {
    await SpinClient.init();
    logger.info(`Starting watching price for >= ${priceChangeTrigger}%`);

    while (lastPrice > -1) {
      const newPrice = await getLastPrice();

      if (numbDiff(lastPrice, newPrice) >= priceChangeTrigger) {
        logger.info('New price trigger event');

        logger.info(
          `Last price: ${lastPrice.toFixed(4)}, new price: ${newPrice.toFixed(
            4,
          )}`,
        );

        logger.info(
          `Next price trigger: >= ${(
            newPrice +
            (newPrice / 100) * priceChangeTrigger
          ).toFixed(4)} or <= ${(
            newPrice -
            (newPrice / 100) * priceChangeTrigger
          ).toFixed(4)}`,
        );

        await SpinClient.cancelAllOrders();
        const balances = await SpinClient.getbalances(true);

        const baseSize =
          maxBase === 0
            ? balances.base.formatted.available * inventoryUsage
            : maxBase >= balances.base.formatted.available
            ? balances.base.formatted.available * inventoryUsage
            : maxBase * inventoryUsage;

        const quoteSize =
          maxQuote === 0
            ? balances.quote.formatted.available * inventoryUsage
            : maxQuote >= balances.quote.formatted.available
            ? balances.quote.formatted.available * inventoryUsage
            : maxQuote * inventoryUsage;

        const orders = calculateGridOrders(
          newPrice,
          baseSize,
          quoteSize,
          SpinClient.step_size,
          SpinClient.tick_size,
          SpinClient.min_base_size,
          SpinClient.min_quote_size,
        );

        lastPrice = newPrice;
        await SpinClient.batchOpsPlacing(orders);
        logger.info('Orders placed. Waiting price change...');
      }

      await sleep(config.get('price.source_check_interval'));
    }
  } catch (err) {
    logger.error(err);
    throw err;
  }
};
