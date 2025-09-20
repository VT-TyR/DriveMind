
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from './logger';
import * as prom from 'prom-client';

const register = new prom.Registry();
prom.collectDefaultMetrics({ register });

const requestCounter = new prom.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(requestCounter);

export const metrics = onRequest(async (request, response) => {
  logger.info('Metrics endpoint hit');
  try {
    response.set('Content-Type', register.contentType);
    response.end(await register.metrics());
  } catch (ex) {
    response.status(500).end(ex);
  }
});
