const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const os = require("os");
const { chromium } = require("playwright-core");
const transitland = require("./transitland");
const { buildExtensionSyncStatus } = require("./sourceSync");
const {
  buildJobBoardSummaries,
  identifyProviderForJob,
  isOpenAvailableJob,
} = require("../shared/domain/providers");

const rootDir = path.join(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const dataDir = path.join(rootDir, "data");
const jobsPath = path.join(dataDir, "jobs.json");
const sourceConfigPath = path.join(dataDir, "source-config.json");

const PORT = Number(process.env.PORT || 3300);
const HOST = process.env.HOST || "127.0.0.1";
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
const DEFAULT_LOGIN_URL = "";
const DEFAULT_DATA_URL = "";
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

async function ensureDefaultTransitFeed() {
  const defaultId = transitland.CTS_DEFAULT_ONESTOP_ID || "o-clarksville~tn~us";
  if (transitland.hasVerifiedGtfsSchedule(defaultId)) return;
  try {
    await transitland.importGtfsFromLocalZip({ onestopId: defaultId, feedUrl: "local-cts-zip" });
    console.log(`Loaded default transit feed for ${defaultId}`);
  } catch (error) {
    console.warn("Default CTS import skipped:", error && error.message ? error.message : error);
  }
}

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

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    for (const item of entries || []) {
      if (!item || item.family !== "IPv4" || item.internal) continue;
      addresses.push(item.address);
    }
  }
  return addresses;
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

function idList(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return [...new Set(
    rawValues
      .flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function transitSelectionFromInput(input = {}, searchParams = null) {
  const outer = input && typeof input === "object" ? input : {};
  const nested = outer.transit_selection || outer.transitSelection;
  const source = nested && typeof nested === "object" ? { ...outer, ...nested } : outer;
  const queryValues = searchParams
    ? [
        ...searchParams.getAll("corridor_id"),
        ...searchParams.getAll("corridor_ids"),
        ...searchParams.getAll("corridorId"),
        ...searchParams.getAll("corridorIds"),
      ]
    : [];
  const corridorIds = idList(
    source.corridor_ids || source.corridorIds || source.corridor_id || source.corridorId || queryValues,
  );
  return {
    plan_id: String(source.plan_id || source.planId || searchParams?.get("plan_id") || searchParams?.get("planId") || "").trim(),
    corridor_ids: corridorIds.length ? corridorIds : ["all-accessible-routes"],
    section_id: String(
      source.section_id || source.sectionId || searchParams?.get("section_id") || searchParams?.get("sectionId") || "all-selected-route-sections",
    ).trim(),
    stop_id: String(source.stop_id || source.stopId || searchParams?.get("stop_id") || searchParams?.get("stopId") || "all-stops-selected").trim(),
  };
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
  return true;
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
  const rawDetails = String(job.detail_fields?.raw || job.details || job.notes || "");
  const statusText = String(job.status || job.job_status || job.detail_fields?.status || "");
  const normalizedStatus = /awaiting[_\s-]?payment/i.test(statusText)
    ? "awaiting_payment"
    : /(?:\bcompleted\b|\bdone\b|\bpaid\b)/i.test(statusText)
    ? "completed"
    : /(?:\bsubmitted\b|\bsubmitted on\b|\bshopped on\b)/i.test(statusText)
    ? "awaiting_payment"
    : "active";
  const completedSignal = /(?:\bcompleted\b|\bdone\b|\bshopped on\b|\bsubmitted on\b)/i.test(
    `${statusText} ${rawDetails}`
  );
  const isCompleted = Boolean(job.is_completed ?? job.completed ?? completedSignal);
  const infoUrl = String(
    job.info_url ||
      job.infoUrl ||
      job.job_url ||
      job.jobUrl ||
      job.source_url ||
      ""
  );
  const mapsUrl = String(job.maps_url || job.mapsUrl || job.map_url || job.mapUrl || "");
  const provider = identifyProviderForJob(job);
  return {
    id: String(job.id || crypto.randomUUID()),
    provider_id: String(job.provider_id || provider?.provider_id || ""),
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
    info_url: infoUrl,
    maps_url: mapsUrl,
    status: String(job.status || job.job_status || normalizedStatus || (isCompleted ? "completed" : "active")),
    workflow_status: String(job.workflow_status || normalizedStatus),
    is_completed: isCompleted,
    notes: String(job.notes || ""),
    details: String(job.details || job.notes || ""),
    detail_fields: extractDetailFields(rawDetails),
    order: Number.isFinite(Number(job.order)) ? Number(job.order) : index + 1,
    updated_at: now,
  };
}

function jobCoordinate(job = {}) {
  const lat = Number(job.lat);
  const lng = Number(job.lng ?? job.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function jobAddressQuery(job = {}) {
  return String(
    job.address ||
      job.address1 ||
      job.detail_fields?.address ||
      [job.city, job.state, job.postcode || job.zip].filter(Boolean).join(", ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function geocodeOpenAvailableJobs(limit = 20) {
  const max = Math.max(1, Math.min(Number(limit) || 20, 50));
  let attempted = 0;
  let updated = 0;
  const results = [];

  for (const job of jobs) {
    if (attempted >= max) break;
    if (!isOpenAvailableJob(job) || jobCoordinate(job)) continue;
    const query = jobAddressQuery(job);
    if (!query) continue;

    attempted += 1;
    const geocoded = await transitland.geocodeAddress(query).catch(() => null);
    if (!geocoded || !Number.isFinite(geocoded.lat) || !Number.isFinite(geocoded.lon)) {
      results.push({ job_id: job.id, ok: false, query });
      continue;
    }

    job.lat = geocoded.lat;
    job.lng = geocoded.lon;
    job.geocoded_from = "job address";
    job.geocoded_display_name = geocoded.display_name || "";
    job.updated_at = new Date().toISOString();
    updated += 1;
    results.push({ job_id: job.id, ok: true, query, lat: job.lat, lng: job.lng });
  }

  if (updated) {
    saveJobs();
    broadcast("jobs", { jobs });
  }

  return {
    ok: true,
    attempted,
    updated,
    results,
    boards: buildJobBoardSummaries({ jobs, sourceStatus }),
  };
}

function extractDetailFields(detailText = "") {
  const text = String(detailText || "").replace(/\s+/g, " ").trim();
  const read = (pattern) => {
    const match = text.match(pattern);
    return match ? String(match[1] || "").replace(/\s+/g, " ").trim() : "";
  };

  const survey = read(/Survey:\s*(.+?)(?=\s+(?:Details|Help\/Contact)\b|$)/i);
  const contact = read(/Details\s*(?:Help\/Contact)?\s*(.+?)(?=\s+Due:|$)/i);
  const address = read(/Help\/Contact\s+(.+?)(?=\s+Due:|$)/i) || read(/Details\s+Help\/Contact\s+(.+?)(?=\s+Due:|$)/i);
  const due = read(/(?:^|\s)Due:\s*([^\s].*?)(?=\s+Submit Due:|\s+Do not shop before:|\s+Shop Pay:|\s+Bonus:|\s+Expenses:|\s+Special Expenses:|$)/i);
  const submitDue = read(/Submit Due:\s*([^\s].*?)(?=\s+Do not shop before:|\s+Shop Pay:|\s+Bonus:|\s+Expenses:|\s+Special Expenses:|$)/i);
  const doNotShopBefore = read(/Do not shop before:\s*([^\s].*?)(?=\s+Shop Pay:|\s+Bonus:|\s+Expenses:|\s+Special Expenses:|$)/i);
  const shopPay = read(/Shop Pay:\s*([^\s].*?)(?=\s+Bonus:|\s+Expenses:|\s+Special Expenses:|$)/i);
  const bonus = read(/Bonus:\s*([^\s].*?)(?=\s+Expenses:|\s+Special Expenses:|$)/i);
  const expensesUpTo = read(/Expenses:\s*up to\s*([^\s].*?)(?=\s+Special Expenses:|$)/i) || read(/Expenses:\s*([^\s].*?)(?=\s+Special Expenses:|$)/i);
  const specialExpensesUpTo = read(/Special Expenses:\s*up to\s*([^\s].*?)$/i) || read(/Special Expenses:\s*([^\s].*?)$/i);
  const completedOn =
    read(/Shopped on:\s*([^\s].*?)(?=\s+Submitted on:|$)/i) ||
    read(/Submitted on:\s*([^\s].*?)$/i);
  const status = /(completed|done|shopped on|submitted on)/i.test(text) ? "completed" : "active";

  return {
    survey,
    contact,
    address,
    due,
    submit_due: submitDue,
    do_not_shop_before: doNotShopBefore,
    shop_pay: shopPay,
    bonus,
    expenses_up_to: expensesUpTo,
    special_expenses_up_to: specialExpensesUpTo,
    completed_on: completedOn,
    status,
    raw: text,
  };
}

function publicSourceConfig() {
  return {
    source_name: String(
      sourceConfig.source_name || sourceConfig.sourceName || "Phone app source"
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
  return String(sourceConfig.source_name || sourceConfig.sourceName || "Linked work app");
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

    function firstHref(root, selector) {
      const node = root.querySelector(selector);
      return node && node.href ? String(node.href) : "";
    }

    function detectCompleted(summary, detailsText) {
      const className = String(summary.className || "");
      return (
        /\bcomplete\b/i.test(className) ||
        /\bcompleted\b/i.test(className) ||
        /\bdone\b/i.test(className) ||
        /(?:\bcompleted\b|\bdone\b|\bshopped on\b|\bsubmitted on\b)/i.test(detailsText)
      );
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
      const infoUrl =
        firstHref(details || summary, 'a[href*="/Info" i]') ||
        firstHref(details || summary, 'a[href^="http" i]') ||
        "";
      const mapsUrl =
        firstHref(details || summary, 'a[href*="maps.google" i]') ||
        firstHref(details || summary, 'a[href*="google.com/maps" i]') ||
        "";
      const addressMatch = detailsText.match(/Details\s+Help\/Contact\s+(.+?)\s+Due:/i);
      const address = addressMatch ? clean(addressMatch[1]) : "";
      const detailNotes = detailsText || clean(summary.textContent);
      const isCompleted = detectCompleted(summary, detailNotes);
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
        info_url: infoUrl,
        maps_url: mapsUrl,
        status: isCompleted ? "completed" : "active",
        is_completed: isCompleted,
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
  const loginUrl = getLiveLoginUrl();
  if (!loginUrl) {
    updateSourceStatus({
      state: "needs-connection",
      message: "Choose a provider web URL or phone-app connection method first",
    });
    throw new Error("Choose a provider web URL or phone-app connection method first");
  }
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
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

function stopLivePolling() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

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

function updateJobStatus(jobId, nextStatus) {
  const normalizedStatus = String(nextStatus || "").trim();
  if (!jobId || !normalizedStatus) return null;

  const byId = new Map(jobs.map((job) => [String(job.id), job]));
  const existing = byId.get(String(jobId));
  if (!existing) return null;

  const status =
    /awaiting[_\s-]?payment/i.test(normalizedStatus)
      ? "awaiting_payment"
      : /(?:\bcompleted\b|\bpaid\b)/i.test(normalizedStatus)
      ? "completed"
      : "active";

  const isCompleted = status === "completed";
  const updatedJob = {
    ...existing,
    status,
    workflow_status: status,
    is_completed: isCompleted,
    updated_at: new Date().toISOString(),
  };
  byId.set(String(jobId), updatedJob);
  jobs = Array.from(byId.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
  saveJobs();
  broadcast("jobs", { jobs });
  return updatedJob;
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
    serveStatic(path.join(frontendDir, "index.html"), res);
    return;
  }

  if (method === "GET" && url.pathname === "/login") {
    res.writeHead(302, authHeader({ Location: "/" }));
    res.end();
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
      Location: "/",
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
      host: HOST,
      network_access_enabled: HOST === "0.0.0.0",
      auth_enabled: true,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/network-info") {
    if (!requireAuth(req, res)) return;
    const addresses = getLocalIpv4Addresses();
    json(res, 200, {
      ok: true,
      addresses,
      preferred_url: addresses.length ? `http://${addresses[0]}:${PORT}` : `http://127.0.0.1:${PORT}`,
      port: PORT,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/jobs") {
    if (!requireAuth(req, res)) return;
    json(res, 200, { jobs });
    return;
  }

  if (method === "GET" && url.pathname === "/api/job-boards") {
    if (!requireAuth(req, res)) return;
    json(res, 200, {
      ok: true,
      boards: buildJobBoardSummaries({ jobs, sourceStatus }),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/jobs/geocode-open") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const limit = Number(body?.limit || url.searchParams.get("limit") || 20);
    const result = await geocodeOpenAvailableJobs(limit).catch((error) => ({
      ok: false,
      error: String(error && error.message ? error.message : error),
    }));
    json(res, result.ok ? 200 : 500, result);
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

  if (method === "POST" && url.pathname === "/api/import-gtfs") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });

    const onestopId = String(
      (body && typeof body === "object" && (body.onestop_id || body.onestopId)) ||
        url.searchParams.get("onestop_id") ||
        url.searchParams.get("onestopId") ||
        ""
    ).trim();

    if (!onestopId) {
      json(res, 400, { ok: false, error: "Missing onestop_id" });
      return;
    }

    const result = await transitland.importGtfsForOperator(onestopId).catch((error) => ({
      ok: false,
      error: String(error && error.message ? error.message : error),
    }));
    json(res, result.ok === false ? 500 : 200, result.ok === false ? result : { ok: true, result });
    return;
  }

  if (method === "POST" && url.pathname === "/api/import-cts-zip") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const filePath = String((body && typeof body === "object" && (body.file_path || body.filePath)) || "").trim();
    const result = await transitland.importGtfsFromLocalZip({
      filePath,
      onestopId: "o-clarksville~tn~us",
      feedUrl: "local-cts-zip",
    }).catch((error) => ({
      ok: false,
      error: String(error && error.message ? error.message : error),
    }));
    json(res, result.ok === false ? 500 : 200, result.ok === false ? result : { ok: true, result });
    return;
  }

  if (method === "GET" && url.pathname === "/api/gtfs/status") {
    if (!requireAuth(req, res)) return;
    const onestopId = String(url.searchParams.get("onestop_id") || url.searchParams.get("onestopId") || "").trim();
    if (!onestopId) {
      json(res, 400, { ok: false, error: "Missing onestop_id" });
      return;
    }
    const cache = transitland.loadGtfsCache(onestopId);
    if (!cache) {
      json(res, 200, { ok: true, imported: false });
      return;
    }
    json(res, 200, {
      ok: true,
      imported: true,
      feedUrl: cache.feedUrl,
      routes: Array.isArray(cache.routes) ? cache.routes.length : 0,
      trips: Array.isArray(cache.trips) ? cache.trips.length : 0,
      stops: Array.isArray(cache.stops) ? cache.stops.length : 0,
      stop_times: Array.isArray(cache.stop_times) ? cache.stop_times.length : 0,
      verified_schedule: transitland.hasVerifiedGtfsSchedule(onestopId),
      importedAt: cache.importedAt || "",
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/transit-picker") {
    if (!requireAuth(req, res)) return;
    const onestopId = String(url.searchParams.get("onestop_id") || url.searchParams.get("onestopId") || "").trim();
    if (!onestopId) {
      json(res, 400, { ok: false, error: "Missing onestop_id" });
      return;
    }

    const picker = transitland.getTransitPickerData({
      onestopId,
      jobs,
      selection: transitSelectionFromInput({}, url.searchParams),
    });
    json(res, 200, picker);
    return;
  }

  if (method === "GET" && url.pathname === "/api/gtfs/nearest") {
    if (!requireAuth(req, res)) return;
    const onestopId = String(url.searchParams.get("onestop_id") || url.searchParams.get("onestopId") || "").trim();
    const lat = String(url.searchParams.get("lat") || "").trim();
    const lon = String(url.searchParams.get("lon") || "").trim();
    const count = Number.parseInt(url.searchParams.get("count") || "5", 10);
    if (!onestopId || !lat || !lon) {
      json(res, 400, { ok: false, error: "Missing params: onestop_id, lat, lon" });
      return;
    }
    const stops = transitland.nearestStops(onestopId, lat, lon, Number.isFinite(count) ? count : 5);
    if (!stops) {
      json(res, 404, { ok: false, error: "No GTFS cache found for that operator" });
      return;
    }
    json(res, 200, { ok: true, stops });
    return;
  }

  if (method === "POST" && url.pathname === "/api/route-plan") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const onestopId = String(body.onestop_id || body.onestopId || "").trim();
    const originInput = body.origin && typeof body.origin === "object" ? body.origin : {};
    const selectedIds = Array.isArray(body.selected_job_ids)
      ? body.selected_job_ids
      : Array.isArray(body.selectedJobIds)
      ? body.selectedJobIds
      : Array.isArray(body.job_ids)
      ? body.job_ids
      : Array.isArray(body.jobIds)
      ? body.jobIds
      : [];
    let jobsInput = [];

    if (selectedIds.length) {
      const wanted = new Set(selectedIds.map((value) => String(value)));
      jobsInput = jobs.filter((job) => wanted.has(String(job.id)));
    } else if (Array.isArray(body)) {
      jobsInput = body;
    } else if (Array.isArray(body.jobs)) {
      jobsInput = body.jobs;
    } else if (body.jobs && typeof body.jobs === "object") {
      jobsInput = Object.values(body.jobs).filter((item) => item && typeof item === "object");
    } else if (typeof body.jobs === "string") {
      try {
        const parsedJobs = JSON.parse(body.jobs);
        jobsInput = Array.isArray(parsedJobs) ? parsedJobs : [];
      } catch {
        jobsInput = [];
      }
    } else {
      jobsInput = jobs.filter(isOpenAvailableJob);
    }

    if (!onestopId) {
      json(res, 400, { ok: false, error: "Missing onestop_id" });
      return;
    }
    if (!jobsInput.length) {
      json(res, 400, { ok: false, error: "Missing jobs array" });
      return;
    }

    const result = await transitland.buildTransitRoutePlan({
      onestopId,
      origin: originInput,
      jobs: jobsInput,
      transitSelection: transitSelectionFromInput(body),
    }).catch((error) => ({
      ok: false,
      error: String(error && error.message ? error.message : error),
    }));

    json(res, result.ok === false ? 500 : 200, result);
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
    const pageUrl = String(body.page_url || body.pageUrl || incoming[0]?.source_url || "");
    const sourceName = String(body.source || incoming[0]?.source || "");
    if (sourceName === "browser-extension" || /jobslingerplus\.com/i.test(pageUrl)) {
      updateSourceStatus(
        buildExtensionSyncStatus({
          syncedJobCount: incoming.length,
          pageUrl,
        })
      );
    }
    broadcast("jobs", { jobs });
    json(res, 200, { ok: true, count: jobs.length, source_status: sourceStatus });
    return;
  }

  if (method === "POST" && url.pathname === "/api/jobs/status") {
    if (!requireAuth(req, res)) return;
    const body = await parseBody(req).catch((error) => {
      json(res, 400, { ok: false, error: error.message });
      return null;
    });
    if (body === null) return;

    const jobId = String(body.job_id || body.jobId || body.id || "").trim();
    const status = String(body.status || body.workflow_status || "").trim();
    if (!jobId || !status) {
      json(res, 400, { ok: false, error: "Missing job_id and status" });
      return;
    }

    const updated = updateJobStatus(jobId, status);
    if (!updated) {
      json(res, 404, { ok: false, error: "Job not found" });
      return;
    }
    json(res, 200, { ok: true, job: updated });
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

server.listen(PORT, HOST, () => {
  const localUrl = `http://127.0.0.1:${PORT}`;
  const boundUrl = HOST === "0.0.0.0" ? `http://0.0.0.0:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server listening on ${localUrl}`);
  if (boundUrl !== localUrl) {
    console.log(`Network binding enabled at ${boundUrl}`);
  }
});

ensureDefaultTransitFeed();
