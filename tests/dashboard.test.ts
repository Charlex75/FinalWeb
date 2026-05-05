import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';

const app   = createApp();
const BASE  = '/api/dashboard';
const UBASE = '/api/user';
const CBASE = '/api/client';
const PBASE = '/api/project';
const DBASE = '/api/deliverynote';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getVerificationCode(email: string): Promise<string> {
  const doc = await User.findOne({ email }).select('+verificationCode');
  return doc!.verificationCode!;
}

async function setupUserWithCompany(email: string, cif: string): Promise<string> {
  await request(app).post(`${UBASE}/register`)
    .send({ name: 'Dash User', email, password: 'Password123' });
  const code = await getVerificationCode(email);
  await request(app).put(`${UBASE}/validation`).send({ email, code });

  const first = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  await request(app).patch(`${UBASE}/company`)
    .set('Authorization', `Bearer ${first.body.token as string}`)
    .send({ name: 'Dash Corp', cif });

  const second = await request(app).post(`${UBASE}/login`).send({ email, password: 'Password123' });
  return second.body.token as string;
}

// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/dashboard', () => {
  let token: string;

  beforeAll(async () => {
    token = await setupUserWithCompany('dashowner@example.com', 'E11111111');

    // Create a client and project
    const clientRes = await request(app).post(CBASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dash Client', cif: 'DC0000001' });
    const clientId = clientRes.body.client._id as string;

    const projRes = await request(app).post(PBASE)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dash Project', projectCode: 'DASH-001', client: clientId });
    const projectId = projRes.body.project._id as string;

    // Use recent dates (always within the last 365 days)
    const d1 = new Date(); d1.setMonth(d1.getMonth() - 3);
    const d2 = new Date(); d2.setMonth(d2.getMonth() - 2);
    const d3 = new Date(); d3.setMonth(d3.getMonth() - 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Create 2 material notes and 1 hours note
    await request(app).post(DBASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        project: projectId, client: clientId,
        format: 'material', description: 'Entrega A',
        workDate: fmt(d1), material: 'Arena', quantity: 20, unit: 'toneladas',
      });

    await request(app).post(DBASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        project: projectId, client: clientId,
        format: 'material', description: 'Entrega B',
        workDate: fmt(d2), material: 'Grava', quantity: 10, unit: 'toneladas',
      });

    const hoursRes = await request(app).post(DBASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        project: projectId, client: clientId,
        format: 'hours', description: 'Jornada',
        workDate: fmt(d3), hours: 8,
      });
    const hoursNoteId = hoursRes.body.deliveryNote._id as string;

    // Sign the hours note so signedNotes > 0
    const sigBuf = await sharp({
      create: { width: 100, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer();

    await request(app)
      .patch(`${DBASE}/${hoursNoteId}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .attach('signature', sigBuf, { filename: 'sig.jpg', contentType: 'image/jpeg' });
  });

  it('returns dashboard with all expected keys → 200', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('notesByMonth');
    expect(res.body).toHaveProperty('hoursByProject');
    expect(res.body).toHaveProperty('formatBreakdown');
    expect(res.body).toHaveProperty('materialsByClient');
  });

  it('summary counts are correct', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    const { summary } = res.body as {
      summary: { clients: number; projects: number; notes: number; signedNotes: number };
    };
    expect(summary.clients).toBe(1);
    expect(summary.projects).toBe(1);
    expect(summary.notes).toBe(3);
    expect(summary.signedNotes).toBe(1);
  });

  it('notesByMonth is an array with entries for the test data', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    const { notesByMonth } = res.body as {
      notesByMonth: Array<{ year: number; month: number; total: number }>;
    };
    expect(notesByMonth).toBeInstanceOf(Array);
    expect(notesByMonth.length).toBeGreaterThanOrEqual(1);
    expect(notesByMonth[0]).toHaveProperty('year');
    expect(notesByMonth[0]).toHaveProperty('month');
    expect(notesByMonth[0]).toHaveProperty('total');
  });

  it('hoursByProject returns project with 8 hours', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    const { hoursByProject } = res.body as {
      hoursByProject: Array<{ projectName: string; totalHours: number }>;
    };
    expect(hoursByProject.length).toBeGreaterThanOrEqual(1);
    expect(hoursByProject[0].totalHours).toBe(8);
    expect(hoursByProject[0].projectName).toBe('Dash Project');
  });

  it('formatBreakdown reflects 2 material + 1 hours notes', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    const { formatBreakdown } = res.body as {
      formatBreakdown: Array<{ format: string; count: number }>;
    };
    const material = formatBreakdown.find(f => f.format === 'material');
    const hours    = formatBreakdown.find(f => f.format === 'hours');
    expect(material?.count).toBe(2);
    expect(hours?.count).toBe(1);
  });

  it('materialsByClient lists the client', async () => {
    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${token}`);

    const { materialsByClient } = res.body as {
      materialsByClient: Array<{ clientName: string; noteCount: number }>;
    };
    expect(materialsByClient.length).toBeGreaterThanOrEqual(1);
    expect(materialsByClient[0].clientName).toBe('Dash Client');
    expect(materialsByClient[0].noteCount).toBe(2);
  });

  it('rejects without token → 401', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('returns 400 for user without company', async () => {
    await request(app).post(`${UBASE}/register`)
      .send({ name: 'No Co', email: 'dashnocompany@example.com', password: 'Password123' });
    const code = await getVerificationCode('dashnocompany@example.com');
    await request(app).put(`${UBASE}/validation`)
      .send({ email: 'dashnocompany@example.com', code });
    const login = await request(app).post(`${UBASE}/login`)
      .send({ email: 'dashnocompany@example.com', password: 'Password123' });

    const res = await request(app).get(BASE)
      .set('Authorization', `Bearer ${login.body.token as string}`);
    expect(res.status).toBe(400);
  });
});
