/**
 * Targeted tests for branches not exercised by the main integration suites:
 *  - Error handler 500 path (non-AppError, e.g. Mongoose CastError)
 *  - authorize() middleware (role.middleware.ts)
 *  - Expired verification code branch (user.controller.ts)
 *  - AppError.forbidden / AppError.tooManyRequests static factories
 */

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { authorize } from '../src/middleware/role.middleware';
import { AppError } from '../src/utils/AppError';

const app   = createApp();
const UBASE = '/api/user';
const CBASE = '/api/client';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function setupUserWithCompany(email: string, cif: string): Promise<string> {
  await request(app).post(`${UBASE}/register`)
    .send({ name: 'Extras User', email, password: 'Password123' });
  const code = await getVerificationCode(email);
  await request(app).put(`${UBASE}/validation`).send({ email, code });
  const first = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  await request(app).patch(`${UBASE}/company`)
    .set('Authorization', `Bearer ${first.body.token as string}`)
    .send({ name: 'Extras Corp', cif });
  const second = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  return second.body.token as string;
}

// ─── Error handler 500 path ──────────────────────────────────────────────────

describe('Error handler — 500 path', () => {
  let token: string;

  beforeAll(async () => {
    token = await setupUserWithCompany('extras500@example.com', 'X11111111');
  });

  it('returns 500 when Mongoose receives an invalid ObjectId (CastError)', async () => {
    // 'not-an-objectid' cannot be cast to ObjectId → Mongoose CastError →
    // asyncHandler forwards it to errorHandler → not an AppError → 500
    const res = await request(app).get(`${CBASE}/not-an-objectid`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
  });
});

// ─── authorize middleware ────────────────────────────────────────────────────

describe('authorize middleware (role.middleware.ts)', () => {
  it('calls next with 401 Unauthorized when req.user is absent', () => {
    const middleware = authorize('admin');
    const next       = jest.fn() as jest.MockedFunction<NextFunction>;

    middleware({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg = next.mock.calls[0]?.[0] as AppError;
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.statusCode).toBe(401);
  });

  it('calls next with 403 Forbidden when user role is not in the allowed list', () => {
    const middleware = authorize('admin');
    const next       = jest.fn() as jest.MockedFunction<NextFunction>;
    const req        = { user: { id: '1', role: 'user', company: 'c1' } } as unknown as Request;

    middleware(req, {} as Response, next);

    const arg = next.mock.calls[0]?.[0] as AppError;
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.statusCode).toBe(403);
  });

  it('calls next with no argument when role is allowed', () => {
    const middleware = authorize('admin', 'user');
    const next       = jest.fn() as jest.MockedFunction<NextFunction>;
    const req        = { user: { id: '1', role: 'user', company: 'c1' } } as unknown as Request;

    middleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ─── AppError static factories ───────────────────────────────────────────────

describe('AppError static factories', () => {
  it('forbidden() returns a 403 AppError with default message', () => {
    const err = AppError.forbidden();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('forbidden() accepts a custom message', () => {
    const err = AppError.forbidden('No access');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('No access');
  });

  it('tooManyRequests() returns a 429 AppError', () => {
    const err = AppError.tooManyRequests();
    expect(err.statusCode).toBe(429);
  });

  it('unauthorized() returns a 401 AppError with default message', () => {
    const err = AppError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });
});

// ─── Expired verification code ───────────────────────────────────────────────

describe('PUT /api/user/validation — expired code', () => {
  it('rejects an expired verification code → 400', async () => {
    await request(app).post(`${UBASE}/register`)
      .send({ name: 'Expiry Test', email: 'expiry@example.com', password: 'Password123' });

    // Force-expire the code directly in the DB (bypasses the pre-save hook)
    await User.updateOne(
      { email: 'expiry@example.com' },
      { verificationCodeExpires: new Date('2000-01-01') },
    );

    const code = await getVerificationCode('expiry@example.com');
    const res  = await request(app).put(`${UBASE}/validation`)
      .send({ email: 'expiry@example.com', code });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });
});
