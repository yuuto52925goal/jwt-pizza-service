const request = require('supertest');
const app = require('../service');
const { randomName, createAdminUser, registerDiner, login } = require('../testHelper');

let diner;
let dinerToken;

beforeAll(async () => {
  ({ user: diner, token: dinerToken } = await registerDiner());
});

test('get me', async () => {
  const res = await request(app).get('/api/user/me').set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.email).toBe(diner.email);
});

test('update self', async () => {
  const newName = randomName();
  const newEmail = newName + '@test.com';
  const res = await request(app)
    .put(`/api/user/${diner.id}`)
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ name: newName, email: newEmail, password: diner.password });
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: diner.id, name: newName, email: newEmail });
  expect(res.body.token).toBeDefined();
});

test('update other user forbidden', async () => {
  const { user: other } = await registerDiner();
  const res = await request(app).put(`/api/user/${other.id}`).set('Authorization', `Bearer ${dinerToken}`).send({ name: 'hacked' });
  expect(res.status).toBe(403);
});

test('admin can update other user', async () => {
  const admin = await createAdminUser();
  const adminToken = await login(admin);
  const { user: other } = await registerDiner();
  const res = await request(app)
    .put(`/api/user/${other.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: other.email, password: other.password });
  expect(res.status).toBe(200);
  expect(res.body.user.id).toBe(other.id);
});

test('list users unauthorized', async () => {
  const res = await request(app).get('/api/user');
  expect(res.status).toBe(401);
});

test('list users forbidden for non-admin', async () => {
  const res = await request(app).get('/api/user').set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(403);
});

describe('list users as admin', () => {
  let adminToken;

  beforeAll(async () => {
    adminToken = await login(await createAdminUser());
  });

  const listUsers = (query = '') => request(app).get(`/api/user${query}`).set('Authorization', `Bearer ${adminToken}`);

  test('returns users with roles', async () => {
    const res = await listUsers();
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String), email: expect.any(String), roles: expect.any(Array) });
    expect(res.body.users[0].password).toBeUndefined();
    expect(typeof res.body.more).toBe('boolean');
  });

  test('paginates', async () => {
    await registerDiner();
    const page0 = await listUsers('?page=0&limit=1');
    const page1 = await listUsers('?page=1&limit=1');
    expect(page0.body.users).toHaveLength(1);
    expect(page0.body.more).toBe(true);
    expect(page1.body.users).toHaveLength(1);
    expect(page1.body.users[0].id).not.toBe(page0.body.users[0].id);
  });

  test('filters by name', async () => {
    const name = randomName();
    const { body } = await request(app).post('/api/auth').send({ name, email: `${name}@test.com`, password: 'a' });

    const res = await listUsers(`?name=${name}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ id: body.user.id, name, email: `${name}@test.com`, roles: [{ role: 'diner' }] }]);
    expect(res.body.more).toBe(false);

    const wildcard = await listUsers(`?name=${name.slice(0, 5)}*`);
    expect(wildcard.body.users.map((u) => u.id)).toContain(body.user.id);
  });
});

test('delete user', async () => {
  const res = await request(app).delete(`/api/user/${diner.id}`).set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('not implemented');
});
