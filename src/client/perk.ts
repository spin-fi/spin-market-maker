import { Perk, SwapMode } from '@perk.money/perk-swap-core'
import { JsonRpcProvider } from 'near-api-js/lib/providers/index.js'
import JSBI from 'jsbi'
import config from '../configs/config.js'
import { getNodeUrl } from './utils.js'

export class PerkClient {
  private perk: Perk
  private connected = false

  constructor() {
    this.perk
  }

  private async connect() {
    this.perk = await Perk.load({
      // @ts-ignore
      provider: new JsonRpcProvider({ url: getNodeUrl() }),
      user: config.get('account_id'),
      routeCacheDuration: 10_000,
    })
    this.connected = true
  }

  async getRoute({ input, output, amount }: { input: string; output: string; amount: string }) {
    if (!this.connected) {
      await this.connect()
    }

    const calculatedRoutes = await this.perk.computeRoutes({
      inputMint: input,
      outputMint: output,
      slippage: 1,
      amount: JSBI.BigInt(amount),
      swapMode: SwapMode.ExactIn, // could be ExactIn and ExactOut
    })

    const refRoutes = calculatedRoutes.routesInfos.filter((route) =>
      route.steps.every((step) => step.amm.label === 'Ref.Finance'),
    )

    return await this.perk.buildTransactions({ route: refRoutes[0] })
  }
}
