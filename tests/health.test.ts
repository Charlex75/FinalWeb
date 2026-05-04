import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 with a valid health payload', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(['connected', 'disconnected']).toContain(res.body.db);
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
    // Timestamp should be a valid ISO date
    expect(() => new Date(res.body.timestamp as string)).not.toThrow();
  });

  it('reflects a connected database when MongoDB is available', async () => {
    // setup.ts connects MongoMemoryServer before this test runs
    const res = await request(app).get('/health');
    expect(res.body.db).toBe('connected');
  });
});
