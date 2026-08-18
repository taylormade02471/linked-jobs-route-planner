const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { chromium } = require("playwright-core");

const rootDir = path.join(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const dataDir = path.join(rootDir, "data");
const jobsPath = path.join(dataDir, "jobs.json");
const sourceConfigPath = path.join(dataDir, "source-config.json");

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
const DEFAULT_LOGIN_URL = "https://www.jobslingerplus.com/";
const DEFAULT_DATA_URL = "https://www.jobslingerplus.com/MegaLog";
const LIVE_POLL_INTERVAL_MS = 60 * 1000;
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

let jobs = loadJobs();
let sourceConfig = loadSourceConfig();
let clients = new Set();
let scrapeRunning = false;
let liveBrowserContext = null;
let liveBrowserPage = null;
let livePollTimer = null;
let liveSourceBusy = false;
let sourceStatus = {
  state: "idle",
  message: "Not connected",
  lastScrapeAt: "",
  browserOpen: false,
};

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

function encryptedPayloadFromText(plainText) {
  if (!plainText) return null;
  const key = crypto.createHash("sha256").update(SESSION_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function textFromEncryptedPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (!payload.iv || !payload.tag || !payload.ciphertext) return "";
  const key = crypto.createHash("sha256").update(SESSION_SECRET).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function loadSourceConfig() {
  try {
    const raw = fs.readFileSync(sourceConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSourceConfig(nextConfig) {
  fs.mkdirSync(dataDir, { recursive: true });
  const nextPasswordPayload =
    Object.prototype.hasOwnProperty.call(nextConfig, "source_password") &&
    nextConfig.source_password
      ? encryptedPayloadFromText(nextConfig.source_password)
      : sourceConfig.source_password || null;
  sourceConfig = {
    ...sourceConfig,
    ...nextConfig,
    source_password: nextPasswordPayload,
  };
  fs.writeFileSync(sourceConfigPath, JSON.stringify(sourceConfig, null, 2), "utf8");
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
    client: String(job.client || ""),
    distance: String(job.distance || job.dist || ""),
    due: String(job.due || ""),
    pay: String(job.pay || ""),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    source: String(job.source || "browser-extension"),
    source_url: String(job.source_url || job.sourceUrl || ""),
    notes: String(job.notes || ""),
    details: String(job.details || job.notes || ""),
    order: Number.isFinite(Number(job.order)) ? Number(job.order) : index + 1,
    updated_at: now,
  };
}

function publicSourceConfig() {
  return {
    source_name: String(
      sourceConfig.source_name || sourceConfig.sourceName || "Jobslinger homepage"
    ),
    login_url: String(sourceConfig.login_url || sourceConfig.loginUrl || DEFAULT_LOGIN_URL),
    data_url: String(sourceConfig.data_url || sourceConfig.dataUrl || DEFAULT_DATA_URL),
    source_username: String(sourceConfig.source_username || sourceConfig.sourceUsername || ""),
    has_password: Boolean(sourceConfig.source_password),
    last_updated_at: String(sourceConfig.last_updated_at || ""),
  };
}

function getSourcePassword() {
  return textFromEncryptedPayload(sourceConfig.source_password);
}

function getChromeExecutablePath() {
  for (const candidate of CHROME_PATHS) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getLiveLoginUrl() {
  return String(sourceConfig.login_url || sourceConfig.loginUrl || DEFAULT_LOGIN_URL);
}

function getLiveSourceName() {
  return String(sourceConfig.source_name || sourceConfig.sourceName || "Jobslinger");
}

function getLiveDataUrl() {
  return String(sourceConfig.data_url || sourceConfig.dataUrl || DEFAULT_DATA_URL);
}

function updateSourceStatus(nextStatus) {
  sourceStatus = {
    ...sourceStatus,
    ...nextStatus,
  };
}

function safeJobText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function maybeAutofillLogin(page) {
  const username = String(sourceConfig.source_username || "");
  const password = getSourcePassword();
  if (!username || !password) return false;

  const userSelectors = [
    'input[type="email"]',
    'input[name*="user" i]',
    'input[name*="email" i]',
    'input[id*="user" i]',
    'input[id*="email" i]',
    'input[type="text"]',
  ];
  const passSelectors = [
    'input[type="password"]',
    'input[name*="pass" i]',
    'input[id*="pass" i]',
  ];

  let filled = false;
  for (const selector of userSelectors) {
    const input = page.locator(selector).first();
    if ((await input.count()) > 0) {
      await input.fill(username).catch(() => {});
      filled = true;
      break;
    }
  }
  for (const selector of passSelectors) {
    const input = page.locator(selector).first();
    if ((await input.count()) > 0) {
      await input.fill(password).catch(() => {});
      filled = true;
      break;
    }
  }
  if (!filled) return false;

  const submitCandidates = [
    page.getByRole("button", { name: /sign in/i }),
    page.getByRole("button", { name: /log in/i }),
    page.getByRole("button", { name: /login/i }),
    page.getByRole("button", { name: /submit/i }),
    page.locator('input[type="submit"]'),
  ];

  for (const candidate of submitCandidates) {
    try {
      if (await candidate.count()) {
        await candidate.first().click({ timeout: 1500 });
        return true;
      }
    } catch {
      // Try the next candidate.
    }
  }

  await page.keyboard.press("Enter").catch(() => {});
  return true;
}

function normalizeJobList(rawJobs) {
  return rawJobs
    .map((job, index) => normalizeJob(job, index))
    .filter((job) => job.title || job.address || job.city || job.state || job.postcode);
}

async function extractJobsFromPage(page) {
  return page.evaluate(() => {
    function textBySelector(root, selector) {
      const node = root.querySelector(selector);
      return (node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
    }

    function clean(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    const rows = [];
    const seen = new Set();
    const summaries = Array.from(document.querySelectorAll("ul.summary"));

    for (const summary of summaries) {
      const title = textBySelector(summary, "li.client");
      const company = textBySelector(summary, "li.company");
      const distance = textBySelector(summary, "li.location");
      const due = textBySelector(summary, "li.date");
      const pay = textBySelector(summary, "li.pay");

      if (!title || /^(client|list view|calendar view|total)/i.test(title)) continue;
      if (!company || !distance) continue;

      const detailsId = String(summary.id || "").replace(/^summary-/, "details-");
      const details = detailsId ? document.getElementById(detailsId) : null;
      const detailsText = clean(details ? details.textContent : "");
      const addressMatch = detailsText.match(/Details\s+Help\/Contact\s+(.+?)\s+Due:/i);
      const address = addressMatch ? clean(addressMatch[1]) : "";
      const detailNotes = detailsText || clean(summary.textContent);
      const rowKey = `${title}::${company}::${distance}::${due}::${pay}`;
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);

      rows.push({
        id: String(summary.id || rowKey),
        title,
        client: company,
        distance,
        due,
        pay,
        address,
        notes: detailNotes,
        details: detailNotes,
      });
    }

    return rows;
  });
}

async function ensureLiveBrowser() {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    updateSourceStatus({ state: "error", message: "Chrome not found on this machine" });
    throw new Error("Chrome executable not found");
  }

  if (liveBrowserContext) {
    return liveBrowserContext;
  }

  fs.mkdirSync(path.join(dataDir, "browser-profile"), { recursive: true });
  liveBrowserContext = await chromium.launchPersistentContext(
    path.join(dataDir, "browser-profile"),
    {
      executablePath: chromePath,
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    }
  );
  liveBrowserContext.on("close", () => {
    liveBrowserContext = null;
    liveBrowserPage = null;
    updateSourceStatus({ browserOpen: false });
  });
  liveBrowserPage = liveBrowserContext.pages()[0] || (await liveBrowserContext.newPage());
  updateSourceStatus({ browserOpen: true, state: "browser-open" });
  return liveBrowserContext;
}

async function openLiveBrowserToSource() {
  const context = await ensureLiveBrowser();
  const page = context.pages()[0] || liveBrowserPage || (await context.newPage());
  liveBrowserPage = page;
  await page.goto(getLiveLoginUrl(), { waitUntil: "domcontentloaded" }).catch(() => {});
  await maybeAutofillLogin(page);
  return { ok: true, browserOpen: true, login_url: getLiveLoginUrl() };
}

async function scrapeLiveJobs() {
  if (liveSourceBusy) {
    return { ok: false, busy: true };
  }
  liveSourceBusy = true;
  try {
    await openLiveBrowserToSource();
    const page = liveBrowserPage || (liveBrowserContext && liveBrowserContext.pages()[0]);
    if (!page) {
      throw new Error("Live browser page is unavailable");
    }

    await page.goto(getLiveDataUrl(), { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});

    const rawJobs = await extractJobsFromPage(page);
    const normalized = normalizeJobList(rawJobs).map((job, index) => ({
      ...job,
      source: getLiveSourceName(),
      source_url: getLiveDataUrl(),
      order: index + 1,
    }));

    if (normalized.length) {
      upsertJobs(normalized);
      updateSourceStatus({
        state: "live",
        message: `Synced ${normalized.length} live jobs`,
        lastScrapeAt: new Date().toISOString(),
      });
      return { ok: true, count: normalized.length };
    }

    updateSourceStatus({
      state: "idle",
      message: "No jobs found on the page yet",
      lastScrapeAt: new Date().toISOString(),
    });
    return { ok: true, count: 0 };
  } catch (error) {
    updateSourceStatus({
      state: "error",
      message: String(error && error.message ? error.message : error),
      lastScrapeAt: new Date().toISOString(),
    });
    return { ok: false, error: String(error && error.message ? error.message : error) };
  } finally {
    liveSourceBusy = false;
  }
}

function startLivePolling(intervalMs = LIVE_POLL_INTERVAL_MS) {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
  livePollTimer = setInterval(() => {
    if (sourceConfig.source_username || sourceConfig.source_password || sourceConfig.login_url || sourceConfig.data_url) {
      scrapeLiveJobs().catch(() => {});
    }
  }, intervalMs);
}

startLivePolling();

function upsertJobs(nextJobs) {
  const normalizedNext = nextJobs.map((job, index) => normalizeJob(job, index));
  const nextSource = String(normalizedNext[0]?.source || "");
  const nextSourceUrl = String(normalizedNext[0]?.source_url || "");
  const shouldReplaceJobSlingerRows = /jobslingerplus\.com/i.test(nextSourceUrl);
  const retainedJobs = jobs.filter((job) => {
    if (shouldReplaceJobSlingerRows) {
      const sourceUrl = String(job.source_url || "");
      const sourceName = String(job.source || "").toLowerCase();
      if (/jobslingerplus\.com/i.test(sourceUrl) || sourceName.includes("jobslinger")) {
        return false;
      }
    }
    if (nextSourceUrl && String(job.source_url || "") === nextSourceUrl) {
      return false;
    }
    if (nextSource && String(job.source || "") === nextSource && nextSourceUrl) {
      return false;
    }
    return true;
  });

  const byId = new Map(retainedJobs.map((job) => [job.id, job]));
  normalizedNext.forEach((job) => {
    byId.set(job.id, { ...byId.get(job.id), ...job });
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

  if (method === "GET" && url.pathname === "/api/source-config") {
    if (!requireAuth(req, res)) return;
    json(res, 200, publicSourceConfig());
    return;
  }

  if (method === "POST" && url.pathname === "/api/source-config") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const nextConfig = {
      source_name: String(body.source_name || body.sourceName || ""),
      login_url: String(body.login_url || body.loginUrl || body.source_url || body.sourceUrl || ""),
      data_url: String(body.data_url || body.dataUrl || ""),
      source_username: String(body.source_username || body.sourceUsername || ""),
      source_password: String(body.source_password || body.sourcePassword || ""),
      last_updated_at: new Date().toISOString(),
    };

    saveSourceConfig(nextConfig);
    updateSourceStatus({
      state: "saved",
      message: "Live source saved",
    });
    json(res, 200, { ok: true, config: publicSourceConfig() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/source-status") {
    if (!requireAuth(req, res)) return;
    json(res, 200, sourceStatus);
    return;
  }

  if (method === "POST" && url.pathname === "/api/source/open") {
    if (!requireAuth(req, res)) return;
    const result = await openLiveBrowserToSource().catch((error) => ({
      ok: false,
      error: String(error && error.message ? error.message : error),
    }));
    json(res, result.ok ? 200 : 500, result);
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
    const result = await scrapeLiveJobs();
    json(res, result.ok ? 200 : 500, {
      ...result,
      jobs,
      source_status: sourceStatus,
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
  console.log(`Server listening on http://localhost:${PORT}`);
});
