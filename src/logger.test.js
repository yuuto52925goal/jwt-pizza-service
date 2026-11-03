const request = require('supertest');
const config = require('./config.js');
const logger = require('./logger.js');

const saved = config.logging;
let fetchMock;

beforeEach(() => {
  config.logging = { source: 'test', endpointUrl: 'http://loki.test/push', accountId: '1', apiKey: 'k' };
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
});
afterEach(() => {
  config.logging = saved;
  jest.restoreAllMocks();
});

const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).streams[0]).map((s) => ({ ...s.stream, data: JSON.parse(s.values[0][1]) }));

test('sanitize masks sensitive keys at any depth', () => {
  const out = JSON.parse(logger.sanitize({ email: 'a@jwt.com', password: 'p', user: { token: 't', jwt: 'j', apiKey: 'x' } }));
  expect(out).toEqual({ email: 'a@jwt.com', password: '*****', user: { token: '*****', jwt: '*****', apiKey: '*****' } });
});

test('http requests are logged with sanitized bodies', async () => {
  const app = require('./service');
  await request(app).put('/api/auth').set('Authorization', 'Bearer abc').send({ email: 'nobody@jwt.com', password: 'secret' });
  const http = sent().find((e) => e.type === 'http');
  expect(http).toMatchObject({ component: 'test', data: { authorized: true, method: 'PUT', path: '/api/auth', reqBody: { password: '*****' } } });
  expect(JSON.stringify(sent())).not.toContain('secret');
});

test('db, factory and error events', async () => {
  logger.dbLogger('SELECT 1');
  logger.factoryLogger({ diner: { id: 1 } }, { jwt: 'abc', reportUrl: 'u' }, false);
  logger.errorLogger(new Error('boom'));
  expect(sent()).toEqual([
    expect.objectContaining({ type: 'db', level: 'info', data: { sql: 'SELECT 1' } }),
    expect.objectContaining({ type: 'factory', level: 'error', data: { reqBody: { diner: { id: 1 } }, resBody: { jwt: '*****', reportUrl: 'u' } } }),
    expect.objectContaining({ type: 'unhandledError', level: 'error', data: expect.objectContaining({ message: 'boom', statusCode: 500 }) }),
  ]);
});

test('logging failures never throw', async () => {
  const errorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 }).mockRejectedValueOnce(new Error('down'));
  logger.dbLogger('a');
  logger.dbLogger('b');
  await new Promise((r) => setImmediate(r));
  expect(errorMock).toHaveBeenCalledTimes(2);
});

test('no endpoint configured means no network call', () => {
  config.logging = undefined;
  logger.dbLogger('a');
  expect(fetchMock).not.toHaveBeenCalled();
});
