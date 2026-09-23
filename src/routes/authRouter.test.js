const request = require('supertest');
const app = require('../service');
const { registerDiner } = require('../testHelper');

const jwtPattern = /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/;

let diner;
let dinerToken;

beforeAll(async () => {
  ({ user: diner, token: dinerToken } = await registerDiner());
});

test('register', async () => {
  expect(dinerToken).toMatch(jwtPattern);
  expect(diner.roles).toEqual([{ role: 'diner' }]);
});

test('register missing fields', async () => {
  const res = await request(app).post('/api/auth').send({ email: 'x@test.com' });
  expect(res.status).toBe(400);
});

test('login', async () => {
  const res = await request(app).put('/api/auth').send({ email: diner.email, password: diner.password });
  expect(res.status).toBe(200);
  expect(res.body.token).toMatch(jwtPattern);
  expect(res.body.user).toMatchObject({ name: diner.name, email: diner.email, roles: [{ role: 'diner' }] });
});

test('login bad password', async () => {
  const res = await request(app).put('/api/auth').send({ email: diner.email, password: 'wrong' });
  expect(res.status).toBe(404);
});

test('logout', async () => {
  const { token } = await registerDiner();
  const res = await request(app).delete('/api/auth').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('logout successful');

  const after = await request(app).get('/api/user/me').set('Authorization', `Bearer ${token}`);
  expect(after.status).toBe(401);
});

test('logout without token', async () => {
  const res = await request(app).delete('/api/auth');
  expect(res.status).toBe(401);
});

test('invalid token is ignored', async () => {
  const res = await request(app).get('/api/user/me').set('Authorization', 'Bearer not.a.jwt');
  expect(res.status).toBe(401);
});
