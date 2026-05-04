import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';

const app  = createApp();
const BASE = '/api/user';

const testUser = {
  name:     'Ana García',
  email:    'ana@example.com',
  password: 'Password123',
};

// Shared state across ordered tests
let accessToken  = '';
let refreshToken = '';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function registerAndActivate(email: string, password = 'Password123') {
  await request(app).post(`${BASE}/register`)
    .send({ name: 'Temp User', email, password });
  const code = await getVerificationCode(email);
  const res  = await request(app).put(`${BASE}/validation`).send({ email, code });
  return res.body as { token: string; refreshToken: string };
}

// ────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/register', () => {
  it('creates a user and returns 201 with tokens', async () => {
    const res = await request(app).post(`${BASE}/register`).send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.status).toBe('pending');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.verificationCode).toBeUndefined();
  });

  it('rejects duplicate email → 409', async () => {
    const res = await request(app).post(`${BASE}/register`).send(testUser);
    expect(res.status).toBe(409);
  });

  it('rejects weak password → 400', async () => {
    const res = await request(app).post(`${BASE}/register`)
      .send({ name: 'Bob', email: 'bob@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('rejects missing fields → 400', async () => {
    const res = await request(app).post(`${BASE}/register`)
      .send({ email: 'incomplete@example.com' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/login (before verification)', () => {
  it('blocks unverified user → 401', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not verified/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /api/user/validation', () => {
  it('activates account with correct code → 200 + tokens', async () => {
    const code = await getVerificationCode(testUser.email);
    const res  = await request(app).put(`${BASE}/validation`)
      .send({ email: testUser.email, code });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.status).toBe('active');

    accessToken  = res.body.token as string;
    refreshToken = res.body.refreshToken as string;
  });

  it('rejects wrong code → 400', async () => {
    const res = await request(app).put(`${BASE}/validation`)
      .send({ email: testUser.email, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('rejects already-verified account → 400', async () => {
    const res = await request(app).put(`${BASE}/validation`)
      .send({ email: testUser.email, code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already verified/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/login', () => {
  it('returns tokens for correct credentials → 200', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.password).toBeUndefined();

    accessToken  = res.body.token as string;
    refreshToken = res.body.refreshToken as string;
  });

  it('rejects wrong password → 401', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email → 401', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: 'nobody@example.com', password: 'Password123' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/user', () => {
  it('returns user with valid token → 200', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects missing token → 401', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('rejects malformed token → 401', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /api/user/register (personal data)', () => {
  it('updates name, surname, nif, phone → 200', async () => {
    const res = await request(app).put(`${BASE}/register`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ana Updated', surname: 'García', nif: '12345678Z', phone: '600000001' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Ana Updated');
    expect(res.body.user.surname).toBe('García');
    expect(res.body.user.nif).toBe('12345678Z');
  });

  it('rejects without token → 401', async () => {
    const res = await request(app).put(`${BASE}/register`)
      .send({ name: 'Hacker' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/user/company', () => {
  it('creates company on first call → 200', async () => {
    const res = await request(app).patch(`${BASE}/company`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'BildyCorp SL', cif: 'B87654321' });

    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('BildyCorp SL');
    expect(res.body.company.cif).toBe('B87654321');
    expect(res.body.company.owner).toBeDefined();
  });

  it('updates company on second call → 200', async () => {
    const res = await request(app).patch(`${BASE}/company`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'BildyCorp Updated SL', cif: 'B87654321' });

    expect(res.status).toBe(200);
    expect(res.body.company.name).toBe('BildyCorp Updated SL');
  });

  it('rejects missing required fields → 400', async () => {
    const res = await request(app).patch(`${BASE}/company`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'NoCIF' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/user/logo', () => {
  it('returns 400 when no file attached', async () => {
    const res = await request(app).patch(`${BASE}/logo`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects without token → 401', async () => {
    const res = await request(app).patch(`${BASE}/logo`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/user/password', () => {
  it('changes password → 200', async () => {
    const res = await request(app).patch(`${BASE}/password`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: testUser.password, newPassword: 'NewPassword456' });

    expect(res.status).toBe(200);
  });

  it('rejects wrong current password → 401', async () => {
    const res = await request(app).patch(`${BASE}/password`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPass1', newPassword: 'AnotherPass1' });

    expect(res.status).toBe(401);
  });

  it('old password no longer works for login → 401', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(401);
  });

  it('new password works for login → 200', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: 'NewPassword456' });

    expect(res.status).toBe(200);
    accessToken  = res.body.token as string;
    refreshToken = res.body.refreshToken as string;
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/refresh', () => {
  it('returns new access token with valid refresh token → 200', async () => {
    const res = await request(app).post(`${BASE}/refresh`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects invalid token → 401', async () => {
    const res = await request(app).post(`${BASE}/refresh`)
      .send({ refreshToken: 'bad.token.value' });
    expect(res.status).toBe(401);
  });

  it('rejects missing token body → 400', async () => {
    const res = await request(app).post(`${BASE}/refresh`).send({});
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/invite', () => {
  it('rejects invite when inviter has no company → 400', async () => {
    const { token: noCoToken } = await registerAndActivate('nocompany@example.com');

    const res = await request(app).post(`${BASE}/invite`)
      .set('Authorization', `Bearer ${noCoToken}`)
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/onboarding/i);
  });

  it('invites a new user → 201 with role guest', async () => {
    const res = await request(app).post(`${BASE}/invite`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'invited@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('guest');
    expect(res.body.user.email).toBe('invited@example.com');
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects inviting an existing email → 409', async () => {
    const res = await request(app).post(`${BASE}/invite`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'invited@example.com' });

    expect(res.status).toBe(409);
  });

  it('rejects invalid email format → 400', async () => {
    const res = await request(app).post(`${BASE}/invite`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/user/logout', () => {
  it('logs out and returns 200', async () => {
    const res = await request(app).post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('refresh token is revoked after logout → 401', async () => {
    const res = await request(app).post(`${BASE}/refresh`)
      .send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/user', () => {
  beforeEach(async () => {
    // Re-login because logout revoked the token
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: 'NewPassword456' });
    accessToken = res.body.token as string;
  });

  it('soft-deletes the user (status → deleted) → 200', async () => {
    const res = await request(app).delete(BASE)
      .query({ soft: 'true' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const user = await User.findOne({ email: testUser.email });
    expect(user?.status).toBe('deleted');
    expect(user?.deletedAt).toBeDefined();
  });

  it('soft-deleted user cannot log in → 401', async () => {
    const res = await request(app).post(`${BASE}/login`)
      .send({ email: testUser.email, password: 'NewPassword456' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deleted/i);
  });
});
