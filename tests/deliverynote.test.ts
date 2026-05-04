import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';

const app   = createApp();
const BASE  = '/api/deliverynote';
const PBASE = '/api/project';
const CBASE = '/api/client';
const UBASE = '/api/user';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function setupUserWithCompany(email: string, cif: string): Promise<string> {
  await request(app).post(`${UBASE}/register`)
    .send({ name: 'DN User', email, password: 'Password123' });
  const code = await getVerificationCode(email);
  await request(app).put(`${UBASE}/validation`).send({ email, code });

  const first = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  await request(app).patch(`${UBASE}/company`)
    .set('Authorization', `Bearer ${first.body.token as string}`)
    .send({ name: 'DN Corp', cif });

  const second = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  return second.body.token as string;
}

async function createClient(token: string, name: string, cif: string): Promise<string> {
  const res = await request(app).post(CBASE)
    .set('Authorization', `Bearer ${token}`).send({ name, cif });
  return res.body.client._id as string;
}

async function createProject(token: string, name: string, code: string, clientId: string): Promise<string> {
  const res = await request(app).post(PBASE)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, projectCode: code, client: clientId });
  return res.body.project._id as string;
}

// ────────────────────────────────────────────────────────────────────────────

describe('DeliveryNote module', () => {
  let token: string;
  let clientId: string;
  let projectId: string;
  let materialNoteId: string;
  let hoursNoteId: string;
  let signedNoteId: string;
  let signatureBuffer: Buffer;

  beforeAll(async () => {
    token     = await setupUserWithCompany('dnowner@example.com', 'D11111111');
    clientId  = await createClient(token, 'DN Client', 'DN00000001');
    projectId = await createProject(token, 'DN Project', 'DN-001', clientId);

    // Small valid JPEG for signature tests
    signatureBuffer = await sharp({
      create: { width: 200, height: 80, channels: 3, background: { r: 30, g: 30, b: 30 } },
    }).jpeg({ quality: 80 }).toBuffer();
  });

  // ─── POST /api/deliverynote ───────────────────────────────────────────────

  describe('POST /api/deliverynote', () => {
    it('creates a material delivery note → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({
          project:     projectId,
          client:      clientId,
          format:      'material',
          description: 'Entrega de cemento',
          workDate:    '2025-03-15',
          material:    'Cemento Portland',
          quantity:    50,
          unit:        'sacos',
        });

      expect(res.status).toBe(201);
      expect(res.body.deliveryNote.format).toBe('material');
      expect(res.body.deliveryNote.material).toBe('Cemento Portland');
      expect(res.body.deliveryNote.signed).toBe(false);

      materialNoteId = res.body.deliveryNote._id as string;
    });

    it('creates a hours delivery note → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({
          project:     projectId,
          client:      clientId,
          format:      'hours',
          description: 'Instalación eléctrica',
          workDate:    '2025-03-16',
          hours:       8,
          workers:     [{ name: 'Juan García', hours: 4 }, { name: 'María López', hours: 4 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.deliveryNote.format).toBe('hours');
      expect(res.body.deliveryNote.workers).toHaveLength(2);

      hoursNoteId = res.body.deliveryNote._id as string;
    });

    it('creates a third note (to be signed) → 201', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({
          project:     projectId,
          client:      clientId,
          format:      'hours',
          description: 'Trabajo a firmar',
          workDate:    '2025-03-17',
          hours:       6,
        });

      expect(res.status).toBe(201);
      signedNoteId = res.body.deliveryNote._id as string;
    });

    it('rejects material format without material field → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ project: projectId, client: clientId, format: 'material', description: 'X', workDate: '2025-01-01' });

      expect(res.status).toBe(400);
    });

    it('rejects hours format without hours or workers → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ project: projectId, client: clientId, format: 'hours', description: 'X', workDate: '2025-01-01' });

      expect(res.status).toBe(400);
    });

    it('rejects project from a different company → 404', async () => {
      const otherToken = await setupUserWithCompany('dnother@example.com', 'D22222222');

      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ project: projectId, client: clientId, format: 'hours', description: 'X', workDate: '2025-01-01', hours: 1 });

      expect(res.status).toBe(404);
    });

    it('rejects missing required fields → 400', async () => {
      const res = await request(app).post(BASE)
        .set('Authorization', `Bearer ${token}`)
        .send({ format: 'hours' });

      expect(res.status).toBe(400);
    });

    it('rejects without token → 401', async () => {
      const res = await request(app).post(BASE)
        .send({ project: projectId, client: clientId, format: 'hours', description: 'X', workDate: '2025-01-01', hours: 1 });
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/deliverynote ────────────────────────────────────────────────

  describe('GET /api/deliverynote', () => {
    it('lists delivery notes with pagination → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNotes).toBeInstanceOf(Array);
      expect(res.body.totalItems).toBeGreaterThanOrEqual(3);
      expect(res.body.currentPage).toBe(1);
    });

    it('filters by format → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ format: 'material' });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNotes.every((n: { format: string }) => n.format === 'material')).toBe(true);
    });

    it('filters by project → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ project: projectId });

      expect(res.status).toBe(200);
      expect(res.body.totalItems).toBeGreaterThanOrEqual(3);
    });

    it('filters by date range → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ from: '2025-03-15', to: '2025-03-16' });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNotes).toHaveLength(2);
    });

    it('filters by signed=false → 200', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ signed: 'false' });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNotes.every((n: { signed: boolean }) => !n.signed)).toBe(true);
    });
  });

  // ─── GET /api/deliverynote/:id ────────────────────────────────────────────

  describe('GET /api/deliverynote/:id', () => {
    it('returns a single note with full populate → 200', async () => {
      const res = await request(app).get(`${BASE}/${materialNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.deliveryNote._id).toBe(materialNoteId);
      expect(res.body.deliveryNote.client).toHaveProperty('name');
      expect(res.body.deliveryNote.project).toHaveProperty('projectCode');
      expect(res.body.deliveryNote.user).toHaveProperty('name');
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).get(`${BASE}/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /api/deliverynote/pdf/:id ────────────────────────────────────────

  describe('GET /api/deliverynote/pdf/:id', () => {
    it('generates and streams a PDF → 200 with application/pdf', async () => {
      const res = await request(app).get(`${BASE}/pdf/${materialNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.body).toBeDefined();
    });

    it('generates PDF for hours note → 200', async () => {
      const res = await request(app).get(`${BASE}/pdf/${hoursNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).get(`${BASE}/pdf/000000000000000000000000`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /api/deliverynote/:id/sign ────────────────────────────────────

  describe('PATCH /api/deliverynote/:id/sign', () => {
    it('signs a delivery note → 200', async () => {
      const res = await request(app)
        .patch(`${BASE}/${signedNoteId}/sign`)
        .set('Authorization', `Bearer ${token}`)
        .attach('signature', signatureBuffer, { filename: 'sig.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNote.signed).toBe(true);
      expect(res.body.deliveryNote.signedAt).toBeDefined();
      expect(res.body.deliveryNote.signatureUrl).toBeDefined();
      expect(res.body.deliveryNote.pdfUrl).toBeDefined();
    });

    it('rejects signing already-signed note → 400', async () => {
      const res = await request(app)
        .patch(`${BASE}/${signedNoteId}/sign`)
        .set('Authorization', `Bearer ${token}`)
        .attach('signature', signatureBuffer, { filename: 'sig.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already signed/i);
    });

    it('rejects sign without file → 400', async () => {
      const res = await request(app)
        .patch(`${BASE}/${hoursNoteId}/sign`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('signed note appears with signed=true in filters', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .query({ signed: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.deliveryNotes.some((n: { _id: string }) => n._id === signedNoteId)).toBe(true);
    });

    it('generates PDF for signed note (with FIRMADO marker) → 200', async () => {
      const res = await request(app).get(`${BASE}/pdf/${signedNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
    });
  });

  // ─── DELETE /api/deliverynote/:id ─────────────────────────────────────────

  describe('DELETE /api/deliverynote/:id', () => {
    it('deletes an unsigned delivery note → 200', async () => {
      const res = await request(app).delete(`${BASE}/${materialNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });

    it('deleted note no longer in list', async () => {
      const res = await request(app).get(BASE)
        .set('Authorization', `Bearer ${token}`);

      const ids = (res.body.deliveryNotes as Array<{ _id: string }>).map(n => n._id);
      expect(ids).not.toContain(materialNoteId);
    });

    it('returns 404 for already-deleted note', async () => {
      const res = await request(app).delete(`${BASE}/${materialNoteId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('rejects deleting a signed note → 400', async () => {
      const res = await request(app).delete(`${BASE}/${signedNoteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/signed/i);
    });
  });
});
