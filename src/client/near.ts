import { keyStores, KeyPair, connect, providers } from 'near-api-js'
import type { ConnectConfig, Near, Account } from 'near-api-js'
import type { CodeResult } from 'near-api-js/lib/providers/provider'
import config from '../configs/config.js'
import { DEFAULT_GAS, DEFAULT_GAS_THIRTY, getContractId, getNodeUrl, NO_DEPOSIT } from './utils.js'
import { BN } from 'bn.js'

export class NearClient {
  private near: Near
  private account: Account
  connected = false

  constructor() {
    this.near
  }

  private async connect() {
    const nearKeystore = new keyStores.InMemoryKeyStore()
    await nearKeystore.setKey(
      config.get('network'),
      config.get('account_id'),
      KeyPair.fromString(config.get('private_key')),
    )

    const connectionConfig: ConnectConfig = {
      networkId: config.get('network'),
      keyStore: nearKeystore,
      nodeUrl: getNodeUrl(),
    }

    this.near = await connect(connectionConfig)
    this.account = await this.near.account(config.get('account_id'))
    this.connected = true
  }

  async viewMethod({ contract = getContractId(), method, args = {} }) {
    if (!this.connected) {
      await this.connect()
    }

    const provider = new providers.JsonRpcProvider({ url: getNodeUrl() })

    const res: CodeResult = await provider.query({
      request_type: 'call_function',
      account_id: contract,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    })

    return JSON.parse(Buffer.from(res.result).toString())
  }

  async callMethod({ contract = getContractId(), method, args = {}, gas = DEFAULT_GAS, deposit = NO_DEPOSIT }) {
    if (!this.connected) {
      await this.connect()
    }

    return await this.account.functionCall({
      contractId: contract,
      methodName: method,
      args: args,
      gas: new BN(gas),
      attachedDeposit: new BN(deposit),
    })
  }

  async getTokenBalance({ contract }): Promise<string> {
    if (!this.connected) {
      await this.connect()
    }

    if (contract === 'near.near' || contract === 'near') {
      return await this.getNearBalance()
    }

    return await this.viewMethod({
      contract: contract,
      method: 'ft_balance_of',
      args: {
        account_id: config.get('account_id'),
      },
    })
  }

  async getNearBalance(): Promise<string> {
    if (!this.connected) {
      await this.connect()
    }
    const balance = await this.account.getAccountBalance()
    return balance.available
  }

  async unwrapNear({ amount }) {
    if (!this.connected) {
      await this.connect()
    }

    return await this.callMethod({
      contract: 'wrap.near',
      method: 'near_withdraw',
      args: {
        amount: amount,
      },
      gas: DEFAULT_GAS_THIRTY,
      deposit: 1,
    })
  }
}
