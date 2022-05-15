import 'reflect-metadata';
import logger from './logger/index.js';
import config from './configs/config.js';
import { GridBot } from './bots/grid.js';

process.on('unhandledRejection', (err) => {
  throw err;
});

const bootstrap = async () => {
  try {
    logger.info('Starting application');
    // Load configuration
    config.loadFile('./config/default.json');

    // Perform validation
    await config.validate({ allowed: 'strict' });

    logger.info('Configuration successful');
    logger.info('Starting Grid Bot');

    await GridBot();
  } catch (err) {
    logger.error({ err }, 'Can not bootstrap application');
    throw err;
  }
};

bootstrap().catch(() => {
  process.exit(1);
});
