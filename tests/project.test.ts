import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';

const app   = createApp();
const BASE  = '/api/project';
const CBASE = '/api/client';
const UBASE = '/api/user';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function setupUserWithCompany(
  email: string,
  companyName = 'Proj Corp',
  companyCif  = 'C00000001',
  password    = 'Password123',
): Promise<string> {
  await request(app).post(`${UBASE}/register`).send({ name: 'Project User', email, password });
  const code = await getVerificationCode(email);
  await request(app).put(`${UBASE}/validation`).send({ email, code });

  const first = await request(app).post(`${UBASE}/login`).send({ email, password });
  const tokenNoCompany = first.body.token as string;

  await request(app)
    .patch(`${UBASE}/company`)
    .set('Authorization', `Bearer ${tokenNoCompany}`)
    .send({ name: companyName, cif: companyCif });

  const second = await request(app).post(`${UBASE}/login`).send({ email, password });
  return second.body.token as string;
}

async function createClient(token: string, name = 'Test Client', cif = 'X00000001'): Promise<string> {
  const res = await request(app).post(CBASE)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, cif });
  return res.body.client._id as string;
}

// ────────────────────────────────────────────────────────────────────────────

describe('Project module', () => {
  let token: string;
  let noCoToken: string;
  let clientId: string;
  let secondClientId: string;
  let projectId: string;
  let secondProjectId: string;

  beforeAll(async () => {
    token = await setupUserWithCompany('projowner@example.com', 'ProjCorp', 'C11111111');

    // Create two clients for this company
    clientId       = await createClient(token, 'Client Alpha', 'X11111111');
    secondClientId = await createClient(token, 'Client Beta',  'X22222222');

    // User without company for negative tests
    await request(app).post(`${UBASE}/register`)
      .send({ name: 'No Company', email: 'noproj@example.com', password: 'Password123' });
    const code = await getVerificationCode('noproj@example.com');
    await request(app).put(`${UBASE}/validation`).send({ email: 'noproj@example.com', code });
    const r = await request(app).post(`${UBASE}/login`)
      .send({ email: 'noproj@example.com', password: 'Password123' });
    noCoToken = r.body.token as string;
  });

  // ─── POST /api/project ────────────────────────────────────────────────────

  describe('POST /api/project', () => {
    it('creates a project → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Reforma Oficina',
          projectCode: 'PRJ-001',
          client: clientId,
          notes: 'Primera planta',
        });

      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe('Reforma Oficina');
      expect(res.body.project.projectCode).toBe('PRJ-001');
      expect(res.body.project.active).toBe(true);
      expect(res.body.project.deleted).toBe(false);

      projectId = res.body.project._id as string;
    });

    it('creates a second project → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Instalación Solar', projectCode: 'PRJ-002', client: clientId });

      expect(res.status).toBe(201);
      secondProjectId = res.body.project._id as string;
    });

    it('rejects duplicate projectCode within same company → 409', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Another Project', projectCode: 'PRJ-001', client: clientId });

      expect(res.status).toBe(409);
    });

    it('allows same projectCode in a different company → 201', async () => {
      const otherToken = await setupUserWithCompany(
        'projother@example.com', 'Other Proj Corp', 'C22222222',
      );
      const otherClientId = await createClient(otherToken, 'Other Client', 'Y11111111');

      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Same Code', projectCode: 'PRJ-001', client: otherClientId });

      expect(res.status).toBe(201);
    });

    it('rejects client from a different company → 404', async () => {
      const otherToken = await setupUserWithCompany(
        'projother2@example.com', 'Other Corp 2', 'C33333333',
      );
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Bad Client Project', projectCode: 'PRJ-X01', client: clientId });

      expect(res.status).toBe(404);
    });

    it('rejects missing required fields → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'No Code' });

      expect(res.status).toBe(400);
    });

    it('rejects user without company → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${noCoToken}`)
        .send({ name: 'X', projectCode: 'X', client: clientId });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/onboarding/i);
    });

    it('rejects missing token → 401', async () => {
      const res = await request(app).post(BASE)
        .send({ name: 'Ghost', projectCode: 'G-001', client: clientId });
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/project ─────────────────────────────────────────────────────

  describe('GET /api/project', () => {
    it('lists active projects with pagination → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.currentPage).toBe(1);
      expect(res.body.totalItems).toBeGreaterThanOrEqual(2);
      expect(typeof res.body.totalPages).toBe('number');
    });

    it('filters by name → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ name: 'reforma' });

      expect(res.status).toBe(200);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
      expect(res.body.projects[0].name).toMatch(/reforma/i);
    });

    it('filters by client → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ client: clientId });

      expect(res.status).toBe(200);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by active=true → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ active: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.projects.every((p: { active: boolean }) => p.active)).toBe(true);
    });

    it('populates client data → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const first = res.body.projects[0] as { client: { name: string } };
      expect(first.client).toHaveProperty('name');
    });

    it('rejects without token → 401', async () => {
      const res = await request(app).get(BASE);
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/project/:id ─────────────────────────────────────────────────

  describe('GET /api/project/:id', () => {
    it('returns a single project with populated client → 200', async () => {
      const res = await request(app).get(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.project._id).toBe(projectId);
      expect(res.body.project.client).toHaveProperty('name');
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).get(`${BASE}/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── PUT /api/project/:id ─────────────────────────────────────────────────

  describe('PUT /api/project/:id', () => {
    it('updates project fields → 200', async () => {
      const res = await request(app).put(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Reforma Oficina Updated', active: false });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe('Reforma Oficina Updated');
      expect(res.body.project.active).toBe(false);
    });

    it('updates client reference → 200', async () => {
      const res = await request(app).put(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ client: secondClientId });

      expect(res.status).toBe(200);
    });

    it('rejects duplicate projectCode from another project → 409', async () => {
      const res = await request(app).put(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectCode: 'PRJ-002' });

      expect(res.status).toBe(409);
    });

    it('allows updating to the same projectCode → 200', async () => {
      const res = await request(app).put(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ projectCode: 'PRJ-001' });

      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app).put(`${BASE}/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE + archived + restore ─────────────────────────────────────────

  describe('DELETE /api/project/:id (soft)', () => {
    it('soft-deletes a project → 200', async () => {
      const res = await request(app).delete(`${BASE}/${projectId}`)
        .query({ soft: 'true' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/archived/i);
    });

    it('archived project not in active list', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      const ids = (res.body.projects as Array<{ _id: string }>).map(p => p._id);
      expect(ids).not.toContain(projectId);
    });

    it('archived project returns 404 via GET /:id', async () => {
      const res = await request(app).get(`${BASE}/${projectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/project/archived', () => {
    it('lists archived projects → 200', async () => {
      const res = await request(app).get(`${BASE}/archived`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.projects as Array<{ _id: string }>).map(p => p._id);
      expect(ids).toContain(projectId);
    });
  });

  describe('PATCH /api/project/:id/restore', () => {
    it('restores an archived project → 200', async () => {
      const res = await request(app).patch(`${BASE}/${projectId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.project.deleted).toBe(false);
    });

    it('restored project appears in active list again', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      const ids = (res.body.projects as Array<{ _id: string }>).map(p => p._id);
      expect(ids).toContain(projectId);
    });

    it('returns 404 when restoring a non-archived project', async () => {
      const res = await request(app).patch(`${BASE}/${projectId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/project/:id (hard)', () => {
    it('hard-deletes a project → 200', async () => {
      const res = await request(app).delete(`${BASE}/${secondProjectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });

    it('hard-deleted project not in active or archived list', async () => {
      const [active, archived] = await Promise.all([
        request(app).get(BASE).set('Authorization', `Bearer ${token}`),
        request(app).get(`${BASE}/archived`).set('Authorization', `Bearer ${token}`),
      ]);

      const activeIds   = (active.body.projects   as Array<{ _id: string }>).map(p => p._id);
      const archivedIds = (archived.body.projects as Array<{ _id: string }>).map(p => p._id);
      expect(activeIds).not.toContain(secondProjectId);
      expect(archivedIds).not.toContain(secondProjectId);
    });
  });
});
