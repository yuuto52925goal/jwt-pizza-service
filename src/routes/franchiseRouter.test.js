const request = require('supertest');
const app = require('../service');
const { randomName, createAdminUser, registerDiner, login } = require('../testHelper');

let admin;
let adminToken;
let diner;
let dinerToken;
let franchise;

beforeAll(async () => {
  admin = await createAdminUser();
  adminToken = await login(admin);
  ({ user: diner, token: dinerToken } = await registerDiner());

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: diner.email }] });
  franchise = res.body;
});

test('create franchise', async () => {
  expect(franchise.id).toBeDefined();
  expect(franchise.admins[0]).toMatchObject({ id: diner.id, email: diner.email });
});

test('create franchise not admin', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ name: randomName(), admins: [{ email: diner.email }] });
  expect(res.status).toBe(403);
});

test('create franchise unknown admin', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: randomName() + '@nobody.com' }] });
  expect(res.status).toBe(404);
});

test('list franchises', async () => {
  const res = await request(app).get(`/api/franchise?page=0&limit=10&name=${franchise.name}`);
  expect(res.status).toBe(200);
  expect(res.body.franchises[0]).toMatchObject({ id: franchise.id, name: franchise.name });
  expect(res.body.more).toBe(false);
});

test('list franchises as admin', async () => {
  const res = await request(app).get(`/api/franchise?name=${franchise.name}`).set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.franchises[0].admins).toBeDefined();
});

test('list franchises with more', async () => {
  const res = await request(app).get('/api/franchise?page=0&limit=1&name=*');
  expect(res.status).toBe(200);
  expect(res.body.franchises.length).toBe(1);
});

test('list user franchises', async () => {
  const res = await request(app).get(`/api/franchise/${diner.id}`).set('Authorization', `Bearer ${dinerToken}`);
  expect(res.status).toBe(200);
  expect(res.body.map((f) => f.id)).toContain(franchise.id);
});

test('list user franchises none', async () => {
  const res = await request(app).get(`/api/franchise/${admin.id}`).set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('list other user franchises not allowed', async () => {
  const { token } = await registerDiner();
  const res = await request(app).get(`/api/franchise/${diner.id}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('create and delete store', async () => {
  const createRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ name: 'SLC' });
  expect(createRes.status).toBe(200);
  expect(createRes.body).toMatchObject({ franchiseId: franchise.id, name: 'SLC' });

  const deleteRes = await request(app)
    .delete(`/api/franchise/${franchise.id}/store/${createRes.body.id}`)
    .set('Authorization', `Bearer ${dinerToken}`);
  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body.message).toBe('store deleted');
});

test('create store forbidden', async () => {
  const { token } = await registerDiner();
  const res = await request(app).post(`/api/franchise/${franchise.id}/store`).set('Authorization', `Bearer ${token}`).send({ name: 'nope' });
  expect(res.status).toBe(403);
});

test('delete store forbidden', async () => {
  const { token } = await registerDiner();
  const res = await request(app).delete(`/api/franchise/${franchise.id}/store/1`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});

test('delete franchise', async () => {
  const createRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [] });
  const res = await request(app).delete(`/api/franchise/${createRes.body.id}`).set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('franchise deleted');
});
