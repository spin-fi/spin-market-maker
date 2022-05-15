import { Api } from '@spinfi/node';
import { Spin, Market, Order, USide } from '@spinfi/core';
import config from '../configs/config.js';
import logger from '../logger/index.js';
import { initApi } from '../sdk/index.js';
import { Balances, GridOrders } from './types.js';
import BigNumber from 'bignumber.js';
import {
  convertToDecimals,
  convertWithDecimals,
  declOfNum,
  getContractID,
  sumOrdersNative,
} from './utils.js';

BigNumber.set({ EXPONENTIAL_AT: 30 });

export class Client {
  private api: Api;
  private spin: Spin;
  private market: Market;
  private balances: Balances;
  tick_size: number;
  step_size: number;
  min_base_size: number;
  min_quote_size: number;

  constructor() {
    this.api;
    this.spin;
    this.market;
    this.balances;
    this.tick_size;
    this.step_size;
    this.min_base_size;
    this.min_quote_size;
  }

  async init(): Promise<void> {
    this.api = await initApi();
    this.spin = await this.api.spin;
    this.market = await this.setMarket();
    this.balances = await this.setBalances();
  }

  private async setMarket() {
    const response = await this.spin.contract.getMarket({
      marketId: config.get('grid.market_id'),
    });

    if (response) {
      if (response.type === 'ERROR') {
        logger.error(response.error);
        throw response.error;
      }

      if (response.type === 'OK') {
        const market = response.data;

        this.tick_size = convertWithDecimals(
          market.limits.tick_size,
          market.quote.decimal,
        );

        this.step_size = convertWithDecimals(
          market.limits.step_size,
          market.base.decimal,
        );

        this.min_base_size = convertWithDecimals(
          market.limits.min_base_quantity,
          market.base.decimal,
        );

        this.min_quote_size = convertWithDecimals(
          market.limits.min_quote_quantity,
          market.quote.decimal,
        );

        if (config.get('grid.levels_step') < this.step_size) {
          throw Error(
            `Levels Step in configuration is lower than market step size. Increase it, or make equal. Levels Step Size: ${config.get(
              'grid.levels_step',
            )}. Market Step Size: ${this.step_size}`,
          );
        }

        return market;
      }
    }

    throw Error('Cant sync market');
  }

  async getOrders(): Promise<Order[]> {
    try {
      return await this.api.account.viewFunction(
        getContractID(),
        'get_orders',
        {
          market_id: this.market.id,
          account_id: config.get('account_id'),
        },
      );
    } catch (error) {
      logger.error(error);
      return [];
    }
  }

  private async setBalances(): Promise<Balances> {
    const response = await this.spin.contract.getDeposits();

    if (response) {
      if (response.type === 'ERROR') {
        logger.error(response.error);
        throw response.error;
      }

      if (response.type === 'OK') {
        const depositsRaw = response.data;
        const accountOrders = await this.getOrders();
        const bRaw: Balances = {
          base: {
            token: this.market.base.address,
            decimal: this.market.base.decimal,
            formatted: {
              balance: 0,
              available: 0,
              locked_in_orders: 0,
            },
            native: {
              balance:
                this.market.base.address in depositsRaw
                  ? depositsRaw[this.market.base.address]
                  : '0',
              available: '0',
              locked_in_orders: sumOrdersNative(
                accountOrders.filter((o) => o.o_type === USide.Ask),
              ),
            },
          },
          quote: {
            token: this.market.quote.address,
            decimal: this.market.quote.decimal,
            formatted: {
              balance: 0,
              available: 0,
              locked_in_orders: 0,
            },
            native: {
              balance:
                this.market.quote.address in depositsRaw
                  ? depositsRaw[this.market.quote.address]
                  : '0',
              available: '0',
              locked_in_orders: accountOrders
                .filter((o) => o.o_type === USide.Bid)
                .reduce(
                  (sum, o) =>
                    new BigNumber(sum)
                      .plus(
                        new BigNumber(o.price).multipliedBy(
                          new BigNumber(o.remaining).dividedBy(
                            new BigNumber(10).pow(
                              new BigNumber(this.market.base.decimal),
                            ),
                          ),
                        ),
                      )
                      .toString() || '0',
                  '0',
                ),
            },
          },
        };

        bRaw.base.native.available = new BigNumber(bRaw.base.native.balance)
          .minus(bRaw.base.native.locked_in_orders)
          .toString();

        bRaw.quote.native.available = new BigNumber(bRaw.quote.native.balance)
          .minus(bRaw.quote.native.locked_in_orders)
          .toString();

        bRaw.base.formatted = {
          balance: convertWithDecimals(
            bRaw.base.native.balance,
            bRaw.base.decimal,
          ),
          available: convertWithDecimals(
            bRaw.base.native.available,
            bRaw.base.decimal,
          ),
          locked_in_orders: convertWithDecimals(
            bRaw.base.native.locked_in_orders,
            bRaw.base.decimal,
          ),
        };
        bRaw.quote.formatted = {
          balance: convertWithDecimals(
            bRaw.quote.native.balance,
            bRaw.quote.decimal,
          ),
          available: convertWithDecimals(
            bRaw.quote.native.available,
            bRaw.quote.decimal,
          ),
          locked_in_orders: convertWithDecimals(
            bRaw.quote.native.locked_in_orders,
            bRaw.quote.decimal,
          ),
        };

        return bRaw;
      }
    }

    throw Error('Cant sync market');
  }

  async cancelAllOrders() {
    const orders = await this.getOrders();
    const ordersLength = orders.length;
    if (!ordersLength) return null;

    logger.info(
      `Cancelling ${orders.length} ${declOfNum(ordersLength, [
        'order',
        'orders',
        'orders',
      ])}...`,
    );

    const response = await this.spin.contract.cancelOrders({
      marketId: this.market.id,
    });

    if (response) {
      if (response.type === 'ERROR') {
        logger.error(response.error);
        throw response.error;
      }

      if (response.type === 'OK') {
        logger.info(`Orders canceled on market #${this.market.id}`);
        return response.data;
      }
    }

    throw Error('Error with cancelling orders');
  }

  getMarket() {
    return this.market;
  }

  async getbalances(updateBalances = false) {
    if (updateBalances) {
      return await this.setBalances();
    }

    return this.balances;
  }

  async batchOpsPlacing(orders: GridOrders) {
    const bidOrders = orders.bids.map((o) => ({
      marketId: this.market.id,
      orderType: USide.Bid,
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      marketOrder: false,
    }));

    const askOrders = orders.asks.map((o) => ({
      marketId: this.market.id,
      orderType: USide.Ask,
      price: convertToDecimals(o.price, this.market.quote.decimal),
      quantity: convertToDecimals(o.size, this.market.base.decimal),
      marketOrder: false,
    }));
    logger.info('Placing orders via batchOps');

    const response = await this.spin.contract.batchOps({
      ops: [
        {
          marketId: this.market.id,
          drop: [],
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          place: [...bidOrders, ...askOrders],
        },
      ],
    });

    if (response) {
      if (response.type === 'ERROR') {
        logger.error(response.error);
        throw response.error;
      }

      // if (response.type === 'OK') {
      //   logger.info(response.data);
      // }
    }
  }
}
