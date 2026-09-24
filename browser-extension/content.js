const SOURCE_URL = "http://127.0.0.1:3300/api/jobs";
const POLL_INTERVAL_MS = 10000;

function readVisibleJobs() {
  const tables = Array.from(document.querySelectorAll("table"));
  const targetTable = tables.find((table) => table.querySelectorAll("tr").length > 1) || tables[0];
  if (!targetTable) return [];

  const rows = Array.from(targetTable.querySelectorAll("tr"));
  const jobs = [];

  rows.forEach((row, index) => {
    const cells = Array.from(row.querySelectorAll("td,th")).map((cell) =>
      cell.textContent.trim()
    );
    if (cells.length < 2) return;
    const [title, address, city, state, postcode] = cells;
    if (!title && !address) return;
    jobs.push({
      id: `${title || "job"}-${index}`,
      title: title || "Job",
      address: address || "",
      city: city || "",
      state: state || "",
      postcode: postcode || "",
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
      body: JSON.stringify({ jobs }),
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
