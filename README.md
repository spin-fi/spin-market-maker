# Spin Market Maker Bot

Application example of how you can use [Spin SDK](https://github.com/spin-fi/near-dex-core-js).
The application logic is a simple market maker or grid bot. Examples of parameters and configuration can be found in the config folder.

> This is experimental software. No one is responsible for your actions. Use at your own risk.

## Start with wallet

You will need the `account_id` and `private key` of your NEAR account. You can obtain them using [near-cli](https://docs.near.org/docs/tools/near-cli).

Login to your `testnet` Near account:

```bash
near login
```

Login to your `mainnet` Near account:

```bash
NEAR_ENV=mainnet near login
```

Open wallet file on your local machine:

```bash
cd ~/.near-credentials
cd testnet
# or
cd mainnet
cat YOUR_WALLET.json
```

Copy `account_id` and `private_key` values to config file:

```json
{
  "account_id": "example.testnet",
  "public_key": "ed25519:...",
  "private_key": "ed25519:..."
}
```

## Deposit assets

You need to deposit the funds that the bot will manage.

1. Use the DEX UI — [testnet.trade.spin.fi](https://testnet.trade.spin.fi/) for `testnet` or [trade.spin.fi](https://trade.spin.fi/) for `mainnet`. Read more about trading on Spin [here](https://docs.spin.fi/tools/spot-trading-mainnet).
2. Use contract methods via [near-cli](https://docs.near.org/docs/tools/near-cli) at [docs.api.spin.fi](https://docs.api.spin.fi/#get_deposits).

## Set the application configuration file

Config schema can be found in `src/configs/config.ts` file.

```jsonc
{
  // value from your wallet
  "account_id": "",
  // value from your wallet
  "private_key": "",
  // Near network: testnet, mainnet
  "network": "testnet",

  // Grid settings
  "grid": {
    // Spin market id: https://docs.api.spin.fi/#get_markets
    "market_id": 1,
    // For NEAR/USDC market:
    // NEAR — base_token
    // USDC — quote_token
    // Max usage of base token in human readeble format
    // If 0 use all funds
    "max_base": 1500,
    // Max usage of quote token in human readeble format
    // If 0 use all funds.
    "max_quote": 100000,
    // Max usage of base and quote assets as a percentage * 100
    // 0 = 0%, .5 = 50%, 1 = 100%
    "inventory_usage": 1,
    // Bid Ask Spread as a percentage
    // 0 = 0%, .5 = 0.5%, 1 = 1%, 20 = 20%, etc.
    "spread": 0.5,
    // Amount of levels for each side
    "levels": 3,
    // Difference between levels
    "levels_step": 0.01,
    // Reallocation of order size to one side
    // Min: -0.999, max: 0.999
    "size_reversal": 0.8
  },

  // Price watch settings
  "price": {
    // Use predefined settings:
    // ref, binance, ftx
    "source": "ref",
    // For ref source use pool id: https://app.ref.finance/pools
    // For binance, ftx: use ticker from exchange.
    "source_ticker": "3",
    // Price sync trigger.
    "source_check_interval": 2000,
    // Price change trigger.
    // 0 = 0%, .5 = 0.5%, 1 = 1%, 20 = 20%, etc.
    "trigger": 0.5
  }
}
```

## Start locally

Install dependencies:

```bash
npm install
```

Development mode:

```bash
npm run dev
```

Build:

```bash
npm run build
# or
npm run build:release
# then
npm run start
```

## Docker

Build image:

```bash
docker build . -t example_image_name
```

Run:

```bash
docker run -it example_image_name
```

Run with custom config (create `example.json` file in config folder):

```bash
docker run -it example_image_name -e CONFIG_FILE example.json
```

## docker-compose

See example in `docker-compose.yml`.
