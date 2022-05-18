import * as nearApi from 'near-api-js';
import { priceFromPool } from '../client/utils.js';
import config from '../configs/config.js';
import logger from '../logger/index.js';

const REF_CONTRACT_ID = 'v2.ref-finance.near';

export class RefPricer {
  private price: number;
  private initialized: boolean;
  private near: nearApi.Near;
  private account: nearApi.Account;
  private poolId: number;
  private baseToken: string;
  private quoteToken: string;
  private baseDecimals: number;
  private quoteDecimals: number;
  private nearConfig: nearApi.ConnectConfig;

  constructor() {
    this.price = 0;
    this.initialized = false;
    this.near;
    this.poolId = 0;
    this.baseToken = '';
    this.quoteToken = '';
    this.baseDecimals = 0;
    this.quoteDecimals = 0;
    this.nearConfig = {
      networkId: 'mainnet',
      nodeUrl: 'https://rpc.mainnet.near.org',
      walletUrl: 'http://wallet.near.org',
      keyStore: new nearApi.keyStores.InMemoryKeyStore(),
      headers: {},
    };
  }

  async init(): Promise<void> {
    this.poolId = +config.get('price.source_ticker');

    this.near = await nearApi.connect(this.nearConfig);

    this.account = await this.near.account('near.near');
    logger.info(`Connected to Ref.Finance — #${this.poolId} pool`);
    this.initialized = true;
  }

  async getPrice(): Promise<number> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const market = await this.account.viewFunction(
        REF_CONTRACT_ID,
        'get_pool',
        { pool_id: this.poolId },
      );
      if (this.baseToken === '') {
        this.baseToken = market.token_account_ids[0];
      }

      if (this.quoteToken === '') {
        this.quoteToken = market.token_account_ids[1];
      }

      if (this.baseDecimals === 0) {
        try {
          const metadata = await this.account.viewFunction(
            this.baseToken,
            'ft_metadata',
          );

          this.baseDecimals = metadata.decimals;
        } catch (error) {
          logger.error(error);
          throw Error(error);
        }
      }

      if (this.quoteDecimals === 0) {
        try {
          const metadata = await this.account.viewFunction(
            this.quoteToken,
            'ft_metadata',
          );

          this.quoteDecimals = metadata.decimals;
        } catch (error) {
          logger.error(error);
          throw Error(error);
        }
      }

      this.price = priceFromPool(
        market.amounts[0],
        this.baseDecimals,
        market.amounts[1],
        this.quoteDecimals,
      );

      return this.price;
    } catch (error) {
      logger.error(error);
      throw Error(error);
    }

    return this.price;
  }
}
