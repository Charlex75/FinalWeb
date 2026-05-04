import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';

const app  = createApp();
const BASE  = '/api/client';
const UBASE = '/api/user';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function setupUserWithCompany(
  email: string,
  companyName = 'Test Corp',
  companyCif  = 'B00000001',
  password    = 'Password123',
): Promise<string> {
  await request(app).post(`${UBASE}/register`).send({ name: 'Test User', email, password });
  const code = await getVerificationCode(email);
  await request(app).put(`${UBASE}/validation`).send({ email, code });

  // Login (token without company yet)
  const first = await request(app).post(`${UBASE}/login`).send({ email, password });
  const tokenNoCompany = first.body.token as string;

  // Create company
  await request(app)
    .patch(`${UBASE}/company`)
    .set('Authorization', `Bearer ${tokenNoCompany}`)
    .send({ name: companyName, cif: companyCif });

  // Re-login to get token that includes company
  const second = await request(app).post(`${UBASE}/login`).send({ email, password });
  return second.body.token as string;
}

// ────────────────────────────────────────────────────────────────────────────

describe('Client module', () => {
  let token: string;          // user with company
  let noCoToken: string;      // user without company
  let clientId: string;
  let secondClientId: string;

  beforeAll(async () => {
    token      = await setupUserWithCompany('clientowner@example.com', 'OwnerCorp', 'B11111111');
    // Register a second user but do NOT create a company
    await request(app).post(`${UBASE}/register`)
      .send({ name: 'No Company', email: 'noclient@example.com', password: 'Password123' });
    const code = await getVerificationCode('noclient@example.com');
    await request(app).put(`${UBASE}/validation`).send({ email: 'noclient@example.com', code });
    const r = await request(app).post(`${UBASE}/login`)
      .send({ email: 'noclient@example.com', password: 'Password123' });
    noCoToken = r.body.token as string;
  });

  // ─── POST /api/client ──────────────────────────────────────────────────────

  describe('POST /api/client', () => {
    it('creates a client → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'García Construcciones', cif: 'B99999991', email: 'garcia@test.com', phone: '600000001' });

      expect(res.status).toBe(201);
      expect(res.body.client.name).toBe('García Construcciones');
      expect(res.body.client.cif).toBe('B99999991');
      expect(res.body.client.deleted).toBe(false);

      clientId = res.body.client._id as string;
    });

    it('creates a second client → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'López Obras', cif: 'B99999992' });

      expect(res.status).toBe(201);
      secondClientId = res.body.client._id as string;
    });

    it('rejects duplicate CIF within same company → 409', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Duplicate CIF Corp', cif: 'B99999991' });

      expect(res.status).toBe(409);
    });

    it('allows same CIF in a different company → 201', async () => {
      const otherToken = await setupUserWithCompany(
        'other@example.com', 'Other Corp', 'B22222222',
      );
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Same CIF Client', cif: 'B99999991' });

      expect(res.status).toBe(201);
    });

    it('rejects missing name → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ cif: 'B55555555' });

      expect(res.status).toBe(400);
    });

    it('rejects invalid email format → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad Email Co', email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('rejects user without company → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${noCoToken}`)
        .send({ name: 'Some Client' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/onboarding/i);
    });

    it('rejects missing token → 401', async () => {
      const res = await request(app).post(BASE).send({ name: 'Ghost Corp' });
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/client ───────────────────────────────────────────────────────

  describe('GET /api/client', () => {
    it('lists active clients with pagination metadata → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.clients).toBeInstanceOf(Array);
      expect(res.body.currentPage).toBe(1);
      expect(res.body.totalItems).toBeGreaterThanOrEqual(2);
      expect(typeof res.body.totalPages).toBe('number');
    });

    it('filters by name (partial, case-insensitive) → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ name: 'garcía' });

      expect(res.status).toBe(200);
      expect(res.body.clients.length).toBeGreaterThanOrEqual(1);
      expect(res.body.clients[0].name).toMatch(/garcía/i);
    });

    it('sorts by -createdAt descending → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ sort: '-createdAt' });

      expect(res.status).toBe(200);
      expect(res.body.clients.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects without token → 401', async () => {
      const res = await request(app).get(BASE);
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/client/:id ──────────────────────────────────────────────────

  describe('GET /api/client/:id', () => {
    it('returns a single client → 200', async () => {
      const res = await request(app).get(`${BASE}/${clientId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.client._id).toBe(clientId);
    });

    it('returns 404 for non-existent id → 404', async () => {
      const res = await request(app).get(`${BASE}/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── PUT /api/client/:id ──────────────────────────────────────────────────

  describe('PUT /api/client/:id', () => {
    it('updates client fields → 200', async () => {
      const res = await request(app).put(`${BASE}/${clientId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'García Construcciones Updated', phone: '611111111' });

      expect(res.status).toBe(200);
      expect(res.body.client.name).toBe('García Construcciones Updated');
      expect(res.body.client.phone).toBe('611111111');
    });

    it('rejects CIF already used by another client → 409', async () => {
      const res = await request(app).put(`${BASE}/${clientId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cif: 'B99999992' });   // secondClientId has this CIF

      expect(res.status).toBe(409);
    });

    it('allows updating to the same CIF (no change) → 200', async () => {
      const res = await request(app).put(`${BASE}/${clientId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cif: 'B99999991' });

      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent client → 404', async () => {
      const res = await request(app).put(`${BASE}/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE + archived + restore ─────────────────────────────────────────

  describe('DELETE /api/client/:id (soft)', () => {
    it('soft-deletes a client → 200', async () => {
      const res = await request(app).delete(`${BASE}/${clientId}`)
        .query({ soft: 'true' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/archived/i);
    });

    it('soft-deleted client no longer appears in active list', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      const ids = (res.body.clients as Array<{ _id: string }>).map(c => c._id);
      expect(ids).not.toContain(clientId);
    });

    it('soft-deleted client returns 404 via GET /:id', async () => {
      const res = await request(app).get(`${BASE}/${clientId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/client/archived', () => {
    it('lists archived clients → 200', async () => {
      const res = await request(app).get(`${BASE}/archived`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.clients).toBeInstanceOf(Array);
      const ids = (res.body.clients as Array<{ _id: string }>).map(c => c._id);
      expect(ids).toContain(clientId);
    });
  });

  describe('PATCH /api/client/:id/restore', () => {
    it('restores an archived client → 200', async () => {
      const res = await request(app).patch(`${BASE}/${clientId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.client.deleted).toBe(false);
    });

    it('restored client appears in active list again', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      const ids = (res.body.clients as Array<{ _id: string }>).map(c => c._id);
      expect(ids).toContain(clientId);
    });

    it('returns 404 when restoring a non-archived client → 404', async () => {
      const res = await request(app).patch(`${BASE}/${clientId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/client/:id (hard)', () => {
    it('hard-deletes a client permanently → 200', async () => {
      const res = await request(app).delete(`${BASE}/${secondClientId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });

    it('hard-deleted client is not in active or archived list', async () => {
      const [active, archived] = await Promise.all([
        request(app).get(BASE).set('Authorization', `Bearer ${token}`),
        request(app).get(`${BASE}/archived`).set('Authorization', `Bearer ${token}`),
      ]);

      const activeIds   = (active.body.clients   as Array<{ _id: string }>).map(c => c._id);
      const archivedIds = (archived.body.clients as Array<{ _id: string }>).map(c => c._id);
      expect(activeIds).not.toContain(secondClientId);
      expect(archivedIds).not.toContain(secondClientId);
    });
  });
});
