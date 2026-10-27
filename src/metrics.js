const os = require('os');
const config = require('./config.js');

const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;

// Cumulative counters, sent to Grafana as monotonic sums
const requests = { total: 0, GET: 0, PUT: 0, POST: 0, DELETE: 0 };
const auth = { success: 0, failure: 0 };
const pizza = { sold: 0, failures: 0, revenue: 0, latencyMs: 0, latencyCount: 0 };
const service = { latencyMs: 0, latencyCount: 0 };
const activeUsers = new Map(); // userId -> last seen time

// Express middleware: request counts, endpoint latency, auth attempts, active users
function requestTracker(req, res, next) {
  const start = Date.now();
  requests.total++;
  if (req.method in requests) requests[req.method]++;
  if (req.user) activeUsers.set(req.user.id, start);

  res.on('finish', () => {
    service.latencyMs += Date.now() - start;
    service.latencyCount++;
    if (req.method === 'PUT' && req.originalUrl === '/api/auth') {
      res.statusCode === 200 ? auth.success++ : auth.failure++;
    }
  });
  next();
}

function pizzaPurchase(success, latencyMs, price, count) {
  pizza.latencyMs += latencyMs;
  pizza.latencyCount++;
  if (success) {
    pizza.sold += count;
    pizza.revenue += price;
  } else {
    pizza.failures++;
  }
}

function getCpuUsagePercentage() {
  return Math.round((os.loadavg()[0] / os.cpus().length) * 100);
}

function getMemoryUsagePercentage() {
  return Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}

function countActiveUsers() {
  const cutoff = Date.now() - ACTIVE_USER_WINDOW_MS;
  for (const [id, lastSeen] of activeUsers) {
    if (lastSeen < cutoff) activeUsers.delete(id);
  }
  return activeUsers.size;
}

function createMetric(name, value, unit, type, attributes = {}) {
  attributes = { ...attributes, source: config.metrics.source };
  const metric = {
    name,
    unit,
    [type]: {
      dataPoints: [
        {
          [Number.isInteger(value) ? 'asInt' : 'asDouble']: value,
          timeUnixNano: Date.now() * 1000000,
          attributes: Object.entries(attributes).map(([key, v]) => ({ key, value: { stringValue: v } })),
        },
      ],
    },
  };
  if (type === 'sum') {
    metric.sum.aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.sum.isMonotonic = true;
  }
  return metric;
}

function buildMetrics() {
  return [
    ...Object.entries(requests).map(([method, v]) => createMetric('http_requests', v, '1', 'sum', { method })),
    createMetric('auth_attempts', auth.success, '1', 'sum', { status: 'success' }),
    createMetric('auth_attempts', auth.failure, '1', 'sum', { status: 'failure' }),
    createMetric('active_users', countActiveUsers(), '1', 'gauge'),
    createMetric('cpu', getCpuUsagePercentage(), '%', 'gauge'),
    createMetric('memory', getMemoryUsagePercentage(), '%', 'gauge'),
    createMetric('pizza_sold', pizza.sold, '1', 'sum'),
    createMetric('pizza_failures', pizza.failures, '1', 'sum'),
    createMetric('pizza_revenue', pizza.revenue, '1', 'sum'),
    createMetric('pizza_latency', pizza.latencyMs, 'ms', 'sum'),
    createMetric('pizza_latency_count', pizza.latencyCount, '1', 'sum'),
    createMetric('service_latency', service.latencyMs, 'ms', 'sum'),
    createMetric('service_latency_count', service.latencyCount, '1', 'sum'),
  ];
}

async function sendMetrics() {
  const body = { resourceMetrics: [{ scopeMetrics: [{ metrics: buildMetrics() }] }] };
  try {
    const res = await fetch(config.metrics.endpointUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) console.error(`Failed to push metrics: HTTP ${res.status}`);
  } catch (error) {
    console.error('Error pushing metrics:', error);
  }
}

// Report every 10 seconds; unref so the timer never keeps the process (or jest) alive
if (config.metrics?.endpointUrl) setInterval(sendMetrics, 10000).unref();

module.exports = { requestTracker, pizzaPurchase, sendMetrics };
