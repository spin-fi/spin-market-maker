import pino from 'pino';
import pretty from 'pino-pretty';
// import config from '../configs/config.js';

const logger = pino(
  // { level: config.get('logging_level') },
  pretty({
    colorize: true,
    translateTime: true,
    ignore: 'pid,hostname',
  }),
);

export default logger;
