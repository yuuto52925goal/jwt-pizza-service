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

test('list users', async () => {
  const res = await request(app).get('/api/user').set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.users).toEqual([]);
});

test('delete user', async () => {
  const res = await request(app).delete(`/api/user/${diner.id}`).set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('not implemented');
});
