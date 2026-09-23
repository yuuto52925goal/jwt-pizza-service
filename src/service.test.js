const request = require('supertest');
const app = require('./service');
const { DB } = require('./database/database.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

// Wait for the database initialization kicked off at import to finish before Jest tears down.
afterAll(() => DB.initialized);

test('root returns welcome', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('welcome to JWT Pizza');
  expect(res.body.version).toBeDefined();
});

test('docs lists endpoints', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body.endpoints.length).toBeGreaterThan(0);
  expect(res.body.config.factory).toBeDefined();
});

test('unknown endpoint returns 404', async () => {
  const res = await request(app).get('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown endpoint');
});
