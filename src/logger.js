const config = require('./config.js');

// Any JSON key matching this is replaced before the log leaves the process
const SENSITIVE_KEY = /password|token|jwt|api_?key|authorization|secret/i;

// Express middleware: one log event per HTTP request, emitted when the response is sent
function httpLogger(req, res, next) {
  const send = res.send;
  res.send = (resBody) => {
    log(statusToLevel(res.statusCode), 'http', {
      authorized: !!req.headers.authorization,
      path: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      reqBody: req.body,
      resBody: parse(resBody),
    });
    res.send = send;
    return res.send(resBody);
  };
  next();
}

// Params are not logged: they carry hashed passwords and auth tokens
function dbLogger(sql) {
  log('info', 'db', { sql });
}

function factoryLogger(reqBody, resBody, ok) {
  log(ok ? 'info' : 'error', 'factory', { reqBody, resBody });
}

function errorLogger(err) {
  log('error', 'unhandledError', { message: err.message, statusCode: err.statusCode ?? 500, stack: err.stack });
}

function log(level, type, data) {
  if (!config.logging?.endpointUrl) return;
  const labels = { component: config.logging.source, level, type };
  const event = { streams: [{ stream: labels, values: [[nowString(), sanitize(data)]] }] };
  send(event);
}

function statusToLevel(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

function nowString() {
  return (Date.now() * 1000000).toString();
}

function sanitize(data) {
  return JSON.stringify(data, (key, value) => (SENSITIVE_KEY.test(key) ? '*****' : value));
}

// res.json() hands res.send a string; parse it so sanitize can see the keys
function parse(body) {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function send(event) {
  // Fire and forget: a logging outage must never break or slow a request
  return fetch(config.logging.endpointUrl, {
    method: 'POST',
    body: JSON.stringify(event),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}` },
  })
    .then((res) => {
      if (!res.ok) console.error(`Failed to send log to Grafana: ${res.status}`);
    })
    .catch((err) => console.error(`Failed to send log to Grafana: ${err.message}`));
}

module.exports = { httpLogger, dbLogger, factoryLogger, errorLogger, sanitize };
