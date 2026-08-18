const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const rootDir = path.join(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const dataDir = path.join(rootDir, "data");
const jobsPath = path.join(dataDir, "jobs.json");

const PORT = Number(process.env.PORT || 3300);
const USERNAME = process.env.APP_USER || process.env.BASIC_AUTH_USER || "kyle";
const PASSWORD =
  process.env.APP_PASSWORD ||
  process.env.BASIC_AUTH_PASSWORD ||
  process.env.BASIC_AUTH_PASS ||
  "taylor";
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET || "change-this-before-sharing";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "route_planner_session";

let jobs = loadJobs();
let clients = new Set();
let scrapeRunning = false;

function loadJobs() {
  try {
    const raw = fs.readFileSync(jobsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJobs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2), "utf8");
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(text);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/json")) {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error("Invalid JSON body"));
        }
        return;
      }
      resolve(raw);
    });
    req.on("error", reject);
  });
}

function parseCookies(header) {
  const cookies = {};
  String(header || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const index = item.indexOf("=");
      if (index === -1) return;
      const key = item.slice(0, index);
      const value = item.slice(index + 1);
      cookies[key] = decodeURIComponent(value);
    });
  return cookies;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function createSessionCookie(username) {
  const session = {
    username,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };
  const payload = base64url(JSON.stringify(session));
  const signature = sign(payload);
  return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
    SESSION_MAX_AGE_MS / 1000
  )}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw || !raw.includes(".")) return null;
  const [payload, signature] = raw.split(".");
  if (sign(payload) !== signature) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function readBasicAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return null;
  const token = header.slice(6);
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index === -1) return null;
    return {
      username: decoded.slice(0, index),
      password: decoded.slice(index + 1),
    };
  } catch {
    return null;
  }
}

function isBasicAuthValid(req) {
  const auth = readBasicAuth(req);
  return Boolean(auth && auth.username === USERNAME && auth.password === PASSWORD);
}

function isDashboardAuthed(req) {
  const session = readSession(req);
  if (session) return true;
  return isBasicAuthValid(req);
}

function requireAuth(req, res) {
  if (isDashboardAuthed(req)) {
    return true;
  }
  res.writeHead(302, {
    Location: "/login",
    "Cache-Control": "no-store",
  });
  res.end();
  return false;
}

function broadcast(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
}

function normalizeJob(job, index = 0) {
  const now = new Date().toISOString();
  const lat = Number(job.lat ?? job.latitude ?? "");
  const lng = Number(job.lng ?? job.longitude ?? "");
  return {
    id: String(job.id || crypto.randomUUID()),
    title: String(job.title || job.name || "Job"),
    address: String(job.address || job.location || ""),
    city: String(job.city || ""),
    state: String(job.state || ""),
    postcode: String(job.postcode || job.zip || ""),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    source: String(job.source || "browser-extension"),
    source_url: String(job.source_url || job.sourceUrl || ""),
    notes: String(job.notes || ""),
    order: Number.isFinite(Number(job.order)) ? Number(job.order) : index + 1,
    updated_at: now,
  };
}

function upsertJobs(nextJobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  nextJobs.forEach((job, index) => {
    const normalized = normalizeJob(job, index);
    byId.set(normalized.id, { ...byId.get(normalized.id), ...normalized });
  });
  jobs = Array.from(byId.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
  saveJobs();
  broadcast("jobs", { jobs });
}

function serveStatic(filePath, res) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
        ? "application/javascript; charset=utf-8"
        : "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    res.end(readFile(filePath));
  } catch {
    sendText(res, 404, "Not found");
  }
}

function renderLoginPage(message = "") {
  return readFile(path.join(frontendDir, "login.html")).replace("%%MESSAGE%%", message);
}

function authHeader(responseHeaders = {}) {
  return {
    "Cache-Control": "no-store",
    ...responseHeaders,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/") {
    if (!requireAuth(req, res)) return;
    serveStatic(path.join(frontendDir, "index.html"), res);
    return;
  }

  if (method === "GET" && url.pathname === "/login") {
    sendHtml(res, 200, renderLoginPage(""));
    return;
  }

  if (method === "POST" && url.pathname === "/auth/login") {
    const body = await parseBody(req).catch((error) => {
      sendHtml(res, 400, renderLoginPage(error.message));
      return null;
    });
    if (body === null) return;

    let username = "";
    let password = "";
    if (typeof body === "string") {
      const params = new URLSearchParams(body);
      username = params.get("username") || "";
      password = params.get("password") || "";
    } else if (body && typeof body === "object") {
      username = String(body.username || "");
      password = String(body.password || "");
    }

    if (username === USERNAME && password === PASSWORD) {
      res.writeHead(302, authHeader({
        "Set-Cookie": createSessionCookie(username),
        Location: "/",
      }));
      res.end();
      return;
    }

    sendHtml(res, 401, renderLoginPage("Invalid username or password."));
    return;
  }

  if (method === "POST" && url.pathname === "/logout") {
    res.writeHead(302, authHeader({
      "Set-Cookie": clearSessionCookie(),
      Location: "/login",
    }));
    res.end();
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    if (!requireAuth(req, res)) return;
    json(res, 200, {
      ok: true,
      service: "linked-jobs-route-planner",
      port: PORT,
      auth_enabled: true,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/jobs") {
    if (!requireAuth(req, res)) return;
    json(res, 200, { jobs });
    return;
  }

  if (method === "POST" && url.pathname === "/api/jobs") {
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const incoming = Array.isArray(body)
      ? body
      : Array.isArray(body.jobs)
      ? body.jobs
      : body.job
      ? [body.job]
      : [];

    if (!incoming.length) {
      json(res, 400, {
        ok: false,
        error: "Expected a jobs array, job object, or array payload.",
      });
      return;
    }

    upsertJobs(incoming);
    json(res, 200, { ok: true, count: jobs.length });
    return;
  }

  if (method === "GET" && url.pathname === "/api/events") {
    if (!requireAuth(req, res)) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/start") {
    if (!requireAuth(req, res)) return;
    scrapeRunning = true;
    broadcast("status", { running: scrapeRunning });
    json(res, 200, { ok: true, running: scrapeRunning });
    return;
  }

  if (method === "POST" && url.pathname === "/api/scrape") {
    if (!requireAuth(req, res)) return;
    json(res, 200, {
      ok: true,
      message:
        "Live sync is handled by the signed-in browser tab or extension. No password-based scraping is required.",
      jobs,
    });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/frontend/")) {
    const relative = url.pathname.slice("/frontend/".length);
    serveStatic(path.join(frontendDir, relative), res);
    return;
  }

  sendText(res, 404, "Not found");
});

server.listen(PORT, () => {
  console.log(`Linked Jobs Route Planner running on http://localhost:${PORT}`);
});
