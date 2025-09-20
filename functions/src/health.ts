
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from './logger';

export const healthCheck = onRequest((request, response) => {
  logger.info('Health check endpoint hit');
  response.status(200).send('OK');
});
