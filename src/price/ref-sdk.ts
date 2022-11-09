import logger from '../logger/index.js'
import {
  ftGetTokenMetadata,
  getPool,
  getPoolEstimate,
  getStablePools,
  TokenMetadata,
  Pool,
  StablePool,
} from '@ref-finance/ref-sdk'
import { Market } from '@spinfi/core'

export class RefPricer {
  private initialized: boolean
  private poolId: number
  private poolRevert: boolean
  private pool: Pool | StablePool
  private baseToken: string
  private baseTokenMetadata: TokenMetadata
  private quoteTokenMetadata: TokenMetadata
  private quoteToken: string
  private baseDecimals: number
  private quoteDecimals: number
  private spinMarket: Market | null

  constructor() {
    this.initialized = false
    this.pool = null
    this.poolRevert = false
    this.baseToken = ''
    this.quoteToken = ''
    this.baseTokenMetadata = null
    this.quoteTokenMetadata = null
    this.baseDecimals = 0
    this.quoteDecimals = 0
    this.spinMarket = null
  }

  async init(poolId: number, spinMarket?: Market): Promise<void> {
    logger.info(`Connected to Ref.Finance`)
    this.initialized = true
    this.poolId = Math.abs(poolId)
    this.poolRevert = poolId < 0
    this.spinMarket = spinMarket
    this.pool = await getPool(this.poolId)

    if (this.baseToken === '') {
      if (this.pool.pool_kind === 'SIMPLE_POOL' || this.pool.pool_kind === 'RATED_SWAP') {
        this.baseToken = this.poolRevert ? this.pool.tokenIds[0] : this.pool.tokenIds[1]
      } else {
        this.baseToken = this.poolRevert
          ? // @ts-ignore
            this.spinMarket?.quote.address || this.pool.token_account_ids[0]
          : // @ts-ignore
            this.spinMarket?.base.address || this.pool.token_account_ids[1]
      }
    }

    if (this.quoteToken === '') {
      if (this.pool.pool_kind === 'SIMPLE_POOL' || this.pool.pool_kind === 'RATED_SWAP') {
        this.quoteToken = this.poolRevert ? this.pool.tokenIds[1] : this.pool.tokenIds[0]
      } else {
        this.quoteToken = this.poolRevert
          ? // @ts-ignore
            this.spinMarket?.base.address || this.pool.token_account_ids[1]
          : // @ts-ignore
            this.spinMarket?.quote.address || this.pool.token_account_ids[0]
      }
    }

    if (this.baseDecimals === 0) {
      try {
        this.baseTokenMetadata = await ftGetTokenMetadata(this.baseToken)
        this.baseDecimals = this.baseTokenMetadata.decimals
      } catch (error) {
        logger.error(error)
        throw Error(error)
      }
    }

    if (this.quoteDecimals === 0) {
      try {
        this.quoteTokenMetadata = await ftGetTokenMetadata(this.quoteToken)
        this.quoteDecimals = this.quoteTokenMetadata.decimals
      } catch (error) {
        logger.error(error)
        throw Error(error)
      }
    }
  }

  async getPrice(poolId: number, spinMarket: Market): Promise<number> {
    if (!this.initialized) {
      await this.init(poolId, spinMarket)
    }

    try {
      this.pool = await getPool(this.poolId)

      if (this.pool.pool_kind === 'SIMPLE_POOL' || this.pool.pool_kind === 'RATED_SWAP') {
        let stablePools = undefined

        if (this.pool.pool_kind === 'RATED_SWAP') {
          stablePools = await getStablePools([this.pool])
        }

        const poolEstimate = await getPoolEstimate({
          tokenIn: this.baseTokenMetadata,
          tokenOut: this.quoteTokenMetadata,
          amountIn: '1',
          pool: this.pool,
          stablePoolDetail: stablePools?.[0],
        })

        return +poolEstimate.estimate
      } else {
        const stablePools = await getStablePools([this.pool])
        const poolEstimate = await getPoolEstimate({
          tokenIn: this.baseTokenMetadata,
          tokenOut: this.quoteTokenMetadata,
          amountIn: '1',
          pool: this.pool,
          stablePoolDetail: stablePools[0],
        })

        return +poolEstimate.estimate
      }
    } catch (error) {
      logger.error(error)
      throw Error(error)
    }
  }
}
