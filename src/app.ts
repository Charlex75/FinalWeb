import express from 'express';
import type { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as swaggerUi from 'swagger-ui-express';
import type { Server } from 'socket.io';
import { apiRateLimit } from './middleware/rate-limit';
import { sanitize } from './middleware/sanitize';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/error-handler';
import router from './routes/index';
import config from './config/index';

export function createApp(io?: Server): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(apiRateLimit);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(sanitize);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  if (io) app.set('io', io);

  app.use('/', router);

  // Must be registered last
  app.use(errorHandler);

  return app;
}
