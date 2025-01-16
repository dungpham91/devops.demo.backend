const request = require('supertest');
const { app } = require('./index');
const { Pool } = require('pg');

jest.mock('pg');
jest.mock('axios');
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

let server;
let pool;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();

  app.listen = jest.fn(() => {
    return { close: jest.fn() };
  });

  pool = new Pool();
  Pool.prototype.query = jest.fn();

  server = app.listen(0);

  const mockInitDb = jest.fn();
  mockInitDb.mockResolvedValueOnce(true);
  require('./index').initializeDatabase = mockInitDb;
});

afterAll(() => {
  server.close();
  pool.end = jest.fn();
});

jest.setTimeout(30000);

describe('Backend API tests', () => {
  it('should return 200 for health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('should return 500 if there is a database error', async () => {
    Pool.prototype.query.mockRejectedValueOnce(new Error('Database error'));
    const res = await request(app).get('/api/btc-block');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
  });
});
