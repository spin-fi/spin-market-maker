import 'reflect-metadata'
import * as dotenvFlow from 'dotenv-flow'
import logger from './logger/index.js'
import config from './configs/config.js'
import { GridBot } from './bots/spotGrid.js'
import { SpotTraderBot } from './bots/spotTrader.js'
import { PerpGridBot } from './bots/perpGrid.js'
import { PerpTraderBot } from './bots/perpTrader.js'

dotenvFlow.config()

process.on('unhandledRejection', (err) => {
  throw err
})

const bootstrap = async () => {
  const configFile = process.env.CONFIG_FILE || 'default.json'
  try {
    logger.info(`Starting application. Loading ${configFile} config`)

    // Load configuration
    config.loadFile(`./config/${configFile}`)

    // Perform validation
    await config.validate({ allowed: 'strict' })

    logger.info('Configuration successful')

    switch (config.get('market')) {
      case 'spot':
        if (config.get('trader.enable')) {
          logger.info('Starting Spot Trader Bot')
          await SpotTraderBot()
        } else {
          logger.info('Starting Grid Bot')
          await GridBot()
        }
        break
      case 'perp':
        if (config.get('trader.enable')) {
          logger.info('Starting Perp Trader Bot')
          await PerpTraderBot()
        } else {
          logger.info('Starting Perp Grid Bot')
          await PerpGridBot()
        }
        break
    }
  } catch (err) {
    logger.error({ err }, 'Can not bootstrap application')
    throw err
  }
}

bootstrap().catch(() => {
  process.exit(1)
})

async function closeGracefully(signal) {
  logger.info(`Received signal to terminate: ${signal}`)
  process.exit(0)
}

process.on('SIGINT', closeGracefully)
process.on('SIGTERM', closeGracefully)
