import { createApi } from '@spinfi/node';
import { getPrestable, getStable } from '@spinfi/shared';
import config from '../configs/config.js';
import logger from '../logger/index.js';

export const initApi = async () => {
  const accountId = config.get('account_id');
  const privateKey = config.get('private_key');
  const network = config.get('network');

  const stage = network === 'testnet' ? getPrestable() : getStable();

  if (accountId === '') {
    throw Error('Please fill in the config file with accountId');
  }

  if (privateKey === '') {
    throw Error('Please fill in the config file with privateKey');
  }

  const { init } = createApi({
    contractId: stage.contractId,
    privateKey: privateKey,
    accountId: accountId,
    websocket: stage.websocket,
    near: stage.near,
  });

  const response = await init();

  if (response.type === 'ERROR') {
    logger.error(response.error);
  }

  if (response.type === 'OK') {
    const api = response.data;
    return api;
  }

  throw Error;
};
