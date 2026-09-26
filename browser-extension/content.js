const POLL_INTERVAL_MS = 30 * 60 * 1000;
const MUTATION_DEBOUNCE_MS = 1500;

let syncTimer = null;
let syncInFlight = false;
let lastSignature = "";

function jobCardForMapLink(link) {
  return (
    link.closest("tr, [data-job], [data-assignment], .job, .shop, .assignment, article, li") ||
    link.parentElement?.parentElement ||
    link.parentElement
  );
}

function detailsUrlForCard(card) {
  const link = card?.querySelector('a[href*="jobslingerplus.com/Info"], a[href^="/Info"]');
  if (!link) return "";
  try {
    return new URL(link.getAttribute("href"), window.location.origin).toString();
  } catch {
    return "";
  }
}

function readVisibleJobs() {
  if (!/^\/MegaLog(?:\/|$)/i.test(window.location.pathname)) return [];
  const parser = globalThis.JobSlingerParser;
  if (!parser?.parseMegaLogCard) return [];

  const mapLinks = Array.from(
    document.querySelectorAll('a[href*="maps.google.com/maps"], a[href*="google.com/maps"]'),
  );
  const jobs = mapLinks
    .map((link, index) => {
      const card = jobCardForMapLink(link);
      if (!card) return null;
      return parser.parseMegaLogCard({
        index,
        mapUrl: link.href,
        detailsUrl: detailsUrlForCard(card),
        text: card.innerText || card.textContent || "",
      });
    })
    .filter(Boolean);

  return jobs.filter((job, index, all) => all.findIndex((candidate) => candidate.id === job.id) === index);
}

function signatureForJobs(jobs) {
  return JSON.stringify(
    jobs.map((job) => ({
      id: job.id,
      title: job.title,
      address: job.address,
      pay_cents: job.pay_cents,
      due: job.due,
      status: job.status,
      details_url: job.details_url,
    })),
  );
}

async function syncJobs() {
  if (syncInFlight) return;
  const jobs = readVisibleJobs();
  if (!jobs.length) return;
  const signature = signatureForJobs(jobs);
  if (signature === lastSignature) return;

  syncInFlight = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "sync-provider-jobs",
      payload: {
        source: {
          provider_id: "jobslinger_megalog",
          provider_label: "JobSlinger MegaLog",
          mode: "signed-in-browser-extension",
          source_status: "live",
        },
        retrieved_at_utc_ms: Date.now(),
        jobs,
      },
    });
    if (!response?.ok) throw new Error(response?.error || "Planner sync failed");
    lastSignature = signature;
  } catch {
    // The local planner may be closed. The next page change or timed check retries safely.
  } finally {
    syncInFlight = false;
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncJobs, MUTATION_DEBOUNCE_MS);
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
syncJobs();
setInterval(syncJobs, POLL_INTERVAL_MS);
