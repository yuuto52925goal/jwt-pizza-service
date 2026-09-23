const request = require('supertest');
const app = require('../service');
const { randomName, createAdminUser, registerDiner, login } = require('../testHelper');

let adminToken;
let dinerToken;
let menuItem;
let franchise;
let store;

beforeAll(async () => {
  const admin = await createAdminUser();
  adminToken = await login(admin);
  ({ token: dinerToken } = await registerDiner());

  const title = randomName();
  const menuRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title, description: 'test pizza', image: 'pizza1.png', price: 0.001 });
  menuItem = menuRes.body.find((m) => m.title === title);

  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [] });
  franchise = franchiseRes.body;

  const storeRes = await request(app).post(`/api/franchise/${franchise.id}/store`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'SLC' });
  store = storeRes.body;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('get menu', async () => {
  const res = await request(app).get('/api/order/menu');
  expect(res.status).toBe(200);
  expect(res.body.map((m) => m.id)).toContain(menuItem.id);
});

test('add menu item not admin', async () => {
  const res = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${dinerToken}`).send({ title: 'x', description: 'x', image: 'x', price: 1 });
  expect(res.status).toBe(403);
});

function orderRequest() {
  return { franchiseId: franchise.id, storeId: store.id, items: [{ menuId: menuItem.id, description: menuItem.description, price: menuItem.price }] };
}

test('create order and list orders', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ jwt: 'factory.jwt.token', reportUrl: 'http://report' }) });

  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(orderRequest());
  expect(res.status).toBe(200);
  expect(res.body.jwt).toBe('factory.jwt.token');
  expect(res.body.order).toMatchObject({ franchiseId: franchise.id, storeId: store.id });

  const listRes = await request(app).get('/api/order').set('Authorization', `Bearer ${dinerToken}`);
  expect(listRes.status).toBe(200);
  expect(listRes.body.orders.map((o) => o.id)).toContain(res.body.order.id);
});

test('create order factory failure', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ reportUrl: 'http://report' }) });

  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${dinerToken}`).send(orderRequest());
  expect(res.status).toBe(500);
  expect(res.body.message).toBe('Failed to fulfill order at factory');
});

test('create order unknown menu item', async () => {
  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ franchiseId: franchise.id, storeId: store.id, items: [{ menuId: -1, description: 'x', price: 1 }] });
  expect(res.status).toBe(500);
});
