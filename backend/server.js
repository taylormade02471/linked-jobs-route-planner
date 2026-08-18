'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const frontendDirectory = path.join(__dirname, '..', 'frontend');
const dataDirectory = path.join(__dirname, '..', 'data');
const jobsFile = path.join(dataDirectory, 'jobs.json');
loadEnvFile(path.join(__dirname, '.env'));

const port = Number(process.env.PORT || 3300);
const maxBodyBytes = 5 * 1024 * 1024;
const appUser = process.env.APP_USER || process.env.BASIC_AUTH_USER || '';
const appPassword = process.env.APP_PASSWORD || process.env.BASIC_AUTH_PASSWORD || '';
const authEnabled = Boolean(appUser && appPassword);
const sseClients = new Set();
let heartbeatTimer = null;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function loadEnvFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] == null) process.env[key] = value;
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin || '';
  const allowedOrigins = [
    'http://localhost:3300',
    'http://127.0.0.1:3300',
    'https://www.jobslingerplus.com',
    'https://jobslingerplus.com'
  ];
  const allowedOrigin = allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')
    ? origin
    : 'http://localhost:3300';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Vary': 'Origin'
  };
}

function authChallengeHeaders(request) {
  return {
    ...corsHeaders(request),
    'WWW-Authenticate': 'Basic realm="Linked Jobs Route Planner", charset="UTF-8"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
}

function hasValidAuth(request) {
  if (!authEnabled) return true;
  const header = request.headers.authorization || '';
  if (!header.toLowerCase().startsWith('basic ')) return false;

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === appUser && password === appPassword;
  } catch {
    return false;
  }
}

function requiresAuth(request, pathname) {
  if (!authEnabled) return false;
  if (request.method === 'OPTIONS') return false;
  if (request.method === 'POST' && pathname === '/api/jobs') return false;
  return true;
}

function sendJson(request, response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...corsHeaders(request),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendApiJson(request, response, statusCode, payload) {
  sendJson(request, response, statusCode, payload);
}

function normalizeJob(job, index) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;

  const fields = Object.entries(job).reduce((result, [key, value]) => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return result;
    result[cleanKey] = String(value ?? '').replace(/\s+/g, ' ').trim();
    return result;
  }, {});

  if (!Object.values(fields).some(Boolean)) return null;

  return {
    id: fields.id || fields.ID || fields.Job || fields['Job ID'] || `row-${index + 1}`,
    title: fields.Title || fields.Shop || fields.Company || fields.Project || fields.Assignment || '',
    location: fields.Location || fields.Address || fields.City || fields.Market || '',
    pay: fields.Pay || fields.Fee || fields.Payment || fields.Compensation || '',
    due: fields.Due || fields.Deadline || fields.Date || fields['Due Date'] || '',
    status: fields.Status || '',
    fields
  };
}

function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { updated_at: null, source: null, jobs: [] };
    }
    throw error;
  }
}

function writeJobs(payload) {
  const jobs = Array.isArray(payload.jobs)
    ? payload.jobs.map(normalizeJob).filter(Boolean)
    : [];

  const saved = {
    updated_at: new Date().toISOString(),
    captured_at: payload.captured_at || payload.capturedAt || null,
    source: payload.source || payload.source_url || payload.sourceUrl || null,
    count: jobs.length,
    jobs
  };

  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(jobsFile, `${JSON.stringify(saved, null, 2)}\n`);
  broadcastEvent('jobs', { count: saved.count, updated_at: saved.updated_at, source: saved.source });
  return saved;
}

function readRequestJson(request, response, onBody) {
  let body = '';

  request.on('data', (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) {
      response.writeHead(413, corsHeaders(request));
      response.end();
      request.destroy();
    }
  });

  request.on('end', () => {
    try {
      onBody(body ? JSON.parse(body) : {});
    } catch {
      sendApiJson(request, response, 400, { error: 'Invalid JSON body.' });
    }
  });
}

function sendFile(request, response) {
  let pathname;

  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    sendJson(request, response, 400, { error: 'Invalid request path.' });
    return;
  }

  let relativePath;

  try {
    relativePath = pathname === '/'
      ? 'index.html'
      : decodeURIComponent(pathname).replace(/^[/\\]+/, '');
  } catch {
    sendJson(request, response, 400, { error: 'Invalid request path.' });
    return;
  }

  const filePath = path.resolve(frontendDirectory, relativePath);
  const allowedPrefix = `${frontendDirectory}${path.sep}`;

  if (!filePath.startsWith(allowedPrefix)) {
    sendJson(request, response, 403, { error: 'File access denied.' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(request, response, error.code === 'ENOENT' ? 404 : 500, {
        error: error.code === 'ENOENT' ? 'Not found.' : 'Unable to read the requested file.'
      });
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(content);
  });
}

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastEvent(event, data) {
  for (const response of sseClients) {
    writeSse(response, event, data);
  }
}

function startHeartbeat(intervalMinutes) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const intervalMs = Math.max(1, Number(intervalMinutes) || 5) * 60 * 1000;
  heartbeatTimer = setInterval(() => {
    broadcastEvent('heartbeat', { at: new Date().toISOString(), jobs: readJobs().count || 0 });
  }, intervalMs);
  return intervalMs;
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (requiresAuth(request, pathname) && !hasValidAuth(request)) {
    response.writeHead(401, authChallengeHeaders(request));
    response.end('Authentication required.');
    return;
  }

  if (pathname === '/api/health') {
    sendApiJson(request, response, 200, {
      ok: true,
      service: 'linked-jobs-route-planner',
      port,
      auth_enabled: authEnabled
    });
    return;
  }

  if (pathname === '/api/jobs' && request.method === 'GET') {
    try {
      sendApiJson(request, response, 200, readJobs());
    } catch {
      sendApiJson(request, response, 500, { error: 'Unable to read saved jobs.' });
    }
    return;
  }

  if (pathname === '/api/jobs' && request.method === 'POST') {
    readRequestJson(request, response, (payload) => {
      try {
        const saved = writeJobs(payload);
        sendApiJson(request, response, 200, {
          ok: true,
          updated_at: saved.updated_at,
          count: saved.count
        });
      } catch {
        sendApiJson(request, response, 500, { error: 'Unable to save jobs.' });
      }
    });
    return;
  }

  if (pathname === '/api/events' && request.method === 'GET') {
    response.writeHead(200, {
      ...corsHeaders(request),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    sseClients.add(response);
    writeSse(response, 'ready', { at: new Date().toISOString(), jobs: readJobs().count || 0 });
    request.on('close', () => sseClients.delete(response));
    return;
  }

  if (pathname === '/api/start' && request.method === 'POST') {
    readRequestJson(request, response, (payload) => {
      const intervalMs = startHeartbeat(payload.interval_minutes);
      sendApiJson(request, response, 200, {
        ok: true,
        mode: 'sse-heartbeat',
        interval_minutes: intervalMs / 60000,
        message: 'Live job updates are pushed when the browser extension syncs new rows.'
      });
    });
    return;
  }

  if (pathname === '/api/scrape' && request.method === 'POST') {
    sendApiJson(request, response, 202, {
      ok: true,
      mode: 'browser-extension-sync',
      count: readJobs().count || 0,
      message: 'Password-based login scraping is disabled. Open the linked job account page with the local sync extension enabled to update saved jobs.'
    });
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    sendFile(request, response);
    return;
  }

  sendApiJson(request, response, 405, { error: 'Method not allowed.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Linked Jobs Route Planner is ready at http://localhost:${port}`);
});
