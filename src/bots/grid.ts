import logger from '../logger/index.js';
import { Client } from '../client/index.js';
import { getLastPrice } from '../price/index.js';
import config from '../configs/config.js';
import { calculateGridOrders, numbDiff } from '../client/utils.js';
import { USide } from '@spinfi/core';
import BigNumber from 'bignumber.js';

export const GridBot = async () => {
  const SpinClient = new Client();
  const priceChangeTrigger = config.get('price.trigger');
  const inventoryUsage = Math.abs(config.get('grid.inventory_usage'));
  const maxBase = Math.abs(config.get('grid.max_base'));
  const maxQuote = Math.abs(config.get('grid.max_quote'));
  let lastPrice = 0;
  let placingInProgress = false;

  if (inventoryUsage > 1) {
    throw Error('Wrong inventory_usage param in config file. Min: 0, max: 1.');
  }

  async function orderPlacing(trigger_event: string, price: number) {
    logger.info('');
    logger.info(trigger_event);
    logger.info('');
    placingInProgress = true;

    if (!config.get('batched')) {
      await SpinClient.cancelAllOrders();
    }

    const balances = await SpinClient.getbalances(true);

    const baseSize =
      maxBase === 0
        ? (balances.base.formatted.available +
            balances.base.formatted.locked_in_orders) *
          inventoryUsage
        : maxBase >=
          balances.base.formatted.available +
            balances.base.formatted.locked_in_orders
        ? (balances.base.formatted.available +
            balances.base.formatted.locked_in_orders) *
          inventoryUsage
        : maxBase * inventoryUsage;

    const quoteSize =
      maxQuote === 0
        ? (balances.quote.formatted.available +
            balances.quote.formatted.locked_in_orders) *
          inventoryUsage
        : maxQuote >=
          balances.quote.formatted.available +
            balances.quote.formatted.locked_in_orders
        ? (balances.quote.formatted.available +
            balances.quote.formatted.locked_in_orders) *
          inventoryUsage
        : maxQuote * inventoryUsage;

    const orders = calculateGridOrders(
      price,
      baseSize,
      quoteSize,
      SpinClient.step_size,
      SpinClient.tick_size,
      SpinClient.min_base_size,
      SpinClient.min_quote_size,
    );

    config.get('batched')
      ? await SpinClient.cancelAndBatchOpsPlacing(orders)
      : await SpinClient.batchOpsPlacing(orders);

    logger.info('Orders placed. Waiting for the triggers...');
    placingInProgress = false;
  }

  async function priceLoop() {
    async function execution() {
      const newPrice = await getLastPrice();

      if (
        numbDiff(lastPrice, newPrice) >= priceChangeTrigger &&
        !placingInProgress
      ) {
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

        lastPrice = newPrice;
        await orderPlacing('New price trigger event', newPrice);
      }
    }
    await execution();
    logger.info(`Watching PRICE CHANGE for >= ${priceChangeTrigger}%`);
    setInterval(
      async () => await execution(),
      Math.abs(config.get('price.source_check_interval')),
    );
  }

  async function triggersLoop() {
    const triggerStrategy = config.get('trigger.trigger_strategy');
    const triggerCheckInterval = Math.abs(
      config.get('trigger.trigger_check_interval'),
    );
    const levels = Math.abs(config.get('grid.levels'));
    const levelsTriggerCount = Math.abs(config.get('trigger.levels_trigger'));
    const percentTriggerCount = Math.abs(config.get('trigger.percent_trigger'));

    logger.info(`Trigger strategy: ${triggerStrategy}`);

    if (triggerStrategy === 'none') {
      return;
    }

    async function levelsTriggerExecution() {
      const triggerNumber = levels - levelsTriggerCount;
      const orders = await SpinClient.getOrders();
      const asks = orders.filter((o) => o.o_type === USide.Ask);
      const bids = orders.filter((o) => o.o_type === USide.Bid);

      if (
        (asks.length <= triggerNumber || bids.length <= triggerNumber) &&
        !placingInProgress
      ) {
        const currentPrice = await getLastPrice();
        await orderPlacing('New levels trigger event', currentPrice);
      }
    }

    async function percentTriggerExecution() {
      const triggerNumber = 1 - percentTriggerCount;
      const orders = await SpinClient.getOrders();
      const asks = orders.filter((o) => o.o_type === USide.Ask);
      const bids = orders.filter((o) => o.o_type === USide.Bid);

      const asksPercent = asks
        .reduce(
          (acc, obj) => acc.plus(new BigNumber(obj.remaining)),
          new BigNumber(0),
        )
        .dividedBy(
          asks.reduce(
            (acc, obj) => acc.plus(new BigNumber(obj.quantity)),
            new BigNumber(0),
          ),
        )
        .toNumber();

      const bidsPercent = bids
        .reduce(
          (acc, obj) => acc.plus(new BigNumber(obj.remaining)),
          new BigNumber(0),
        )
        .dividedBy(
          bids.reduce(
            (acc, obj) => acc.plus(new BigNumber(obj.quantity)),
            new BigNumber(0),
          ),
        )
        .toNumber();

      if (
        (asksPercent <= triggerNumber || bidsPercent <= triggerNumber) &&
        !placingInProgress
      ) {
        const currentPrice = await getLastPrice();
        await orderPlacing('New percent trigger event', currentPrice);
      }
    }

    if (triggerStrategy === 'levels') {
      if (levelsTriggerCount <= 0) {
        throw new Error('trigger.levels_trigger must be above zero.');
      }

      logger.info(
        `Watching LEVELS CHANGE >= ${levelsTriggerCount}. Current levels: ${levels}`,
      );
      await levelsTriggerExecution();
      setInterval(
        async () => await levelsTriggerExecution(),
        triggerCheckInterval,
      );
    }

    if (triggerStrategy === 'percent') {
      logger.info(`Watching PERCENT CHANGE >= ${percentTriggerCount}`);
      if (percentTriggerCount <= 0) {
        throw new Error('trigger.percent_trigger must be above zero.');
      }

      await percentTriggerExecution();
      setInterval(
        async () => await percentTriggerExecution(),
        triggerCheckInterval,
      );
    }
  }

  try {
    await SpinClient.init();
    await priceLoop();
    await triggersLoop();
  } catch (err) {
    logger.error(err);
    throw err;
  }
};
