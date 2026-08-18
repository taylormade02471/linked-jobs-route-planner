function readVisibleJobs() {
  const rows = Array.from(document.querySelectorAll("table tr"));
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
      order: index + 1,
    });
  });

  return jobs;
}

async function syncJobs() {
  const jobs = readVisibleJobs();
  if (!jobs.length) return;

  try {
    await fetch("http://127.0.0.1:3300/api/jobs", {
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

