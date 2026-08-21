const SOURCE_URL = "http://127.0.0.1:3300/api/jobs";
const POLL_INTERVAL_MS = 10000;

function isMegaLogPage() {
  return /\/MegaLog(?:[/?#]|$)/i.test(window.location.href);
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function readVisibleJobs() {
  if (!isMegaLogPage()) return [];

  const summaries = Array.from(document.querySelectorAll("ul.summary"));
  const jobs = [];
  const seen = new Set();

  summaries.forEach((summary, index) => {
    const title = clean(summary.querySelector("li.client")?.textContent);
    const client = clean(summary.querySelector("li.company")?.textContent);
    const distance = clean(summary.querySelector("li.location")?.textContent);
    const due = clean(summary.querySelector("li.date")?.textContent);
    const pay = clean(summary.querySelector("li.pay")?.textContent);

    if (!title || !client || !distance) return;
    if (/^(client|list view|calendar view|total)/i.test(title)) return;

    const detailsId = String(summary.id || "").replace(/^summary-/, "details-");
    const details = detailsId ? document.getElementById(detailsId) : null;
    const detailsText = clean(details ? details.textContent : "");
    const addressMatch = detailsText.match(/Details\s+Help\/Contact\s+(.+?)\s+Due:/i);
    const address = addressMatch ? clean(addressMatch[1]) : "";
    const notes = detailsText || clean(summary.textContent);
    const id = summary.id || `${title}-${index}`;

    if (seen.has(id)) return;
    seen.add(id);

    jobs.push({
      id,
      title,
      client,
      distance,
      due,
      pay,
      address,
      details: notes,
      notes,
      source: "browser-extension",
      source_url: window.location.href,
      order: index + 1,
    });
  });

  return jobs;
}

async function syncJobs() {
  const jobs = readVisibleJobs();
  if (!jobs.length) return;

  try {
    await fetch(SOURCE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "browser-extension",
        page_url: window.location.href,
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
