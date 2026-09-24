const SOURCE_URL = "http://127.0.0.1:3300/api/jobs";
const POLL_INTERVAL_MS = 10000;

const PROVIDERS = [
  { id: "jobslinger", label: "Jobslinger MegaLog", hosts: ["jobslingerplus.com"] },
  { id: "survey_merchandiser", label: "Survey Merchandiser", hosts: ["survey.com"] },
  { id: "clickworker", label: "Clickworker", hosts: ["workplace.clickworker.com", "clickworker.com"] },
  { id: "field_nation", label: "Field Nation", hosts: ["fieldnation.com"] },
  { id: "field_agent", label: "Field Agent", hosts: ["fieldagent.net", "app.fieldagent.net"] },
];

const CARD_SELECTORS_BY_PROVIDER = {
  survey_merchandiser: ["[data-job-id]", "[data-job-card]", ".job-card", ".job-listing"],
  clickworker: ["[data-job-id]", "[data-job-card]", ".job-card", ".job-listing"],
  field_nation: ["[data-job-id]", "[data-job-card]", ".job-card", ".work-order-card"],
};

const TABLE_FIELD_ALIASES = {
  title: ["title", "job", "store", "location name", "assignment", "project"],
  address: ["address", "street", "site address", "location"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  postcode: ["zip", "zipcode", "postal", "postcode"],
  pay: ["pay", "rate", "fee", "amount", "earnings"],
  status: ["status", "availability", "state"],
};

function detectProvider(hostname) {
  return PROVIDERS.find((provider) => provider.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) || null;
}

function slug(value) {
  return String(value || "job")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "job";
}

function uniqueTextValues(nodes) {
  return Array.from(nodes)
    .map((node) => node.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeHeader(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumnIndex(headers, field) {
  const aliases = TABLE_FIELD_ALIASES[field] || [];
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

function parseTableJobs(provider) {
  const tables = Array.from(document.querySelectorAll("table"));
  const targetTable = tables
    .map((table) => ({ table, rows: table.querySelectorAll("tr").length }))
    .sort((a, b) => b.rows - a.rows)[0]?.table;
  if (!targetTable) return [];

  const headers = Array.from(targetTable.querySelectorAll("tr"))
    .find((row) => row.querySelector("th"))
    ? uniqueTextValues(targetTable.querySelectorAll("tr th")).map(normalizeHeader)
    : [];

  const titleIndex = findColumnIndex(headers, "title");
  const addressIndex = findColumnIndex(headers, "address");
  const cityIndex = findColumnIndex(headers, "city");
  const stateIndex = findColumnIndex(headers, "state");
  const postcodeIndex = findColumnIndex(headers, "postcode");
  const payIndex = findColumnIndex(headers, "pay");
  const statusIndex = findColumnIndex(headers, "status");

  return Array.from(targetTable.querySelectorAll("tr"))
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.querySelector("th"))
    .map(({ row, index }) => {
      const cells = uniqueTextValues(row.querySelectorAll("td"));
      if (cells.length < 2) return null;
      const title = titleIndex >= 0 ? cells[titleIndex] || "" : cells[0] || "";
      const address = addressIndex >= 0 ? cells[addressIndex] || "" : cells[1] || "";
      const city = cityIndex >= 0 ? cells[cityIndex] || "" : cells[2] || "";
      const state = stateIndex >= 0 ? cells[stateIndex] || "" : cells[3] || "";
      const postcode = postcodeIndex >= 0 ? cells[postcodeIndex] || "" : cells[4] || "";
      const pay = payIndex >= 0 ? cells[payIndex] || "" : cells[5] || "";
      const status = statusIndex >= 0 ? cells[statusIndex] || "" : cells[6] || "";
      return {
        id: `${provider.id}-${slug(title)}-${slug(address)}-${index}`,
        title: title || "Job",
        address: address || "",
        city,
        state,
        postcode,
        pay,
        status,
        source: provider.label,
        provider_id: provider.id,
        source_url: window.location.href,
        order: index + 1,
      };
    })
    .filter(Boolean);
}

function parseCardJobs(provider) {
  const selectors = CARD_SELECTORS_BY_PROVIDER[provider.id] || [];
  for (const selector of selectors) {
    const cards = Array.from(document.querySelectorAll(selector)).filter((node) => node.querySelectorAll("a, button, div, span, p").length >= 3);
    if (cards.length < 2) continue;
    const jobs = cards
      .map((card, index) => {
        const title =
          card.querySelector("h1, h2, h3, [data-job-title], .job-title, .title")?.textContent?.trim() || "";
        const address =
          card.querySelector("[data-address], .job-address, .address")?.textContent?.trim() || "";
        const location =
          address ||
          card.querySelector("[data-location], .location, .job-location")?.textContent?.trim() ||
          "";
        const city = card.querySelector("[data-city], .city")?.textContent?.trim() || "";
        const state = card.querySelector("[data-state], .state")?.textContent?.trim() || "";
        const pay = card.querySelector("[data-pay], .pay, .rate")?.textContent?.trim() || "";
        const status = card.querySelector("[data-status], .status, .badge")?.textContent?.trim() || "";
        if (!title || !(location || city || state)) return null;
        return {
          id: `${provider.id}-${slug(title)}-${slug(location || `${city}-${state}`)}-${index}`,
          title,
          address: location,
          city,
          state,
          pay,
          status,
          source: provider.label,
          provider_id: provider.id,
          source_url: window.location.href,
          order: index + 1,
        };
      })
      .filter(Boolean);
    if (jobs.length) return jobs;
  }
  return [];
}

function readVisibleJobs(provider) {
  const tableJobs = parseTableJobs(provider);
  return tableJobs.length ? tableJobs : parseCardJobs(provider);
}

async function syncJobs() {
  const provider = detectProvider(window.location.hostname);
  if (!provider) return;

  const jobs = readVisibleJobs(provider);
  if (!jobs.length) return;

  try {
    await fetch(SOURCE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_id: provider.id,
        source: provider.label,
        jobs,
      }),
    });
  } catch {
    // The dashboard may be offline. Try again on the next page update.
  }
}

const observer = new MutationObserver(() => {
  syncJobs();
});

observer.observe(document.documentElement, { childList: true, subtree: true });
syncJobs();
setInterval(syncJobs, POLL_INTERVAL_MS);
