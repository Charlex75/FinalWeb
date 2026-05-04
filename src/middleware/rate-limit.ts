import rateLimit from 'express-rate-limit';
import config from '../config/index';

const isTest = process.env['NODE_ENV'] === 'test';

export const apiRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: { status: 'error', message: 'Too many requests, please try again later.' },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: { status: 'error', message: 'Too many authentication attempts.' },
});
