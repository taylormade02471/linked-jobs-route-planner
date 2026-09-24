const SOURCE_URL = "http://127.0.0.1:3300/api/jobs";
const POLL_INTERVAL_MS = 10000;

const PROVIDERS = [
  { id: "jobslinger", label: "Jobslinger MegaLog", hosts: ["jobslingerplus.com"] },
  { id: "survey_merchandiser", label: "Survey Merchandiser", hosts: ["survey.com"] },
  { id: "clickworker", label: "Clickworker", hosts: ["workplace.clickworker.com", "clickworker.com"] },
  { id: "field_nation", label: "Field Nation", hosts: ["fieldnation.com"] },
  { id: "field_agent", label: "Field Agent", hosts: ["fieldagent.net", "app.fieldagent.net"] },
];

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

function parseTableJobs(provider) {
  const tables = Array.from(document.querySelectorAll("table"));
  const targetTable = tables
    .map((table) => ({ table, rows: table.querySelectorAll("tr").length }))
    .sort((a, b) => b.rows - a.rows)[0]?.table;
  if (!targetTable) return [];

  return Array.from(targetTable.querySelectorAll("tr"))
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.querySelector("th"))
    .map(({ row, index }) => {
      const cells = uniqueTextValues(row.querySelectorAll("td"));
      if (cells.length < 2) return null;
      const [title, address, city = "", state = "", postcode = "", pay = "", status = ""] = cells;
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
  const selectors = ["article", "[data-job-id]", ".job-card", ".card", "li"];
  for (const selector of selectors) {
    const cards = Array.from(document.querySelectorAll(selector)).filter((node) => node.querySelectorAll("a, button, div, span, p").length >= 3);
    if (cards.length < 2) continue;
    const jobs = cards
      .map((card, index) => {
        const lines = uniqueTextValues(card.querySelectorAll("h1, h2, h3, strong, a, p, span, div"));
        if (lines.length < 2) return null;
        const [title, address, city = "", state = "", pay = "", status = ""] = lines;
        return {
          id: `${provider.id}-${slug(title)}-${slug(address)}-${index}`,
          title: title || "Job",
          address: address || "",
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
  return parseTableJobs(provider).length ? parseTableJobs(provider) : parseCardJobs(provider);
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
