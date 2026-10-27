const request = require('supertest');
const app = require('./service');
const metrics = require('./metrics');

test('sends all metrics to Grafana', async () => {
  await request(app).get('/');
  await request(app).put('/api/auth').send({ email: 'nobody@jwt.com', password: 'bad' });
  metrics.pizzaPurchase(true, 120, 0.05, 1);
  metrics.pizzaPurchase(false, 300, 0, 22);

  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 });
  const errorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
  await metrics.sendMetrics();

  const names = JSON.parse(fetchMock.mock.calls[0][1].body).resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name);
  expect(names).toEqual(expect.arrayContaining(['http_requests', 'auth_attempts', 'active_users', 'cpu', 'memory', 'pizza_sold', 'pizza_failures', 'pizza_revenue', 'pizza_latency', 'service_latency']));
  expect(errorMock).toHaveBeenCalled();

  fetchMock.mockRejectedValue(new Error('down'));
  await metrics.sendMetrics();
  expect(errorMock).toHaveBeenCalledTimes(2);
  jest.restoreAllMocks();
});
