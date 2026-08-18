const jobsTableBody = document.querySelector("#jobsTableBody");
const jobCount = document.querySelector("#jobCount");
const selectedCount = document.querySelector("#selectedCount");
const connectionState = document.querySelector("#connectionState");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const routeButton = document.querySelector("#routeButton");
const exportButton = document.querySelector("#exportButton");
const selectAll = document.querySelector("#selectAll");
const logoutForm = document.querySelector("#logoutForm");
const sourceConfigForm = document.querySelector("#sourceConfigForm");
const reloadSourceButton = document.querySelector("#reloadSourceButton");
const openSourceButton = document.querySelector("#openSourceButton");
const scrapeNowButton = document.querySelector("#scrapeNowButton");
const sourceStatus = document.querySelector("#sourceStatus");
const template = document.querySelector("#jobRowTemplate");

let allJobs = [];
let filteredJobs = [];
let expandedJobs = new Set();

function setConnection(text) {
  connectionState.textContent = text;
}

function setSourceStatus(text) {
  if (sourceStatus) {
    sourceStatus.textContent = text;
  }
}

function getSelectedJobs() {
  return filteredJobs.filter((job) => job.selected);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  filteredJobs = allJobs.filter((job) => {
    const haystack = [
      job.title,
      job.address,
      job.city,
      job.state,
      job.postcode,
      job.client,
      job.distance,
      job.due,
      job.pay,
      job.source,
      job.details,
    ]
      .join(" ")
      .toLowerCase();
    return !query || haystack.includes(query);
  });

  jobsTableBody.innerHTML = "";

  filteredJobs.forEach((job) => {
    const fragment = template.content.cloneNode(true);
    const [row, detailsRow] = fragment.querySelectorAll("tr");

    row.querySelector(".job-check").checked = Boolean(job.selected);
    row.querySelector(".job-check").addEventListener("change", (event) => {
      job.selected = event.target.checked;
      updateCounts();
    });

    row.querySelector(".details-toggle").addEventListener("click", () => {
      if (expandedJobs.has(job.id)) {
        expandedJobs.delete(job.id);
      } else {
        expandedJobs.add(job.id);
      }
      render();
    });

    row.querySelector(".job-title").textContent = job.title || "Job";
    row.querySelector(".job-address").textContent =
      [job.client, job.address].filter(Boolean).join(" - ") || "—";
    row.querySelector(".job-location").textContent =
      [job.distance, job.city, job.state, job.postcode].filter(Boolean).join(", ") || "—";
    row.querySelector(".job-duepay").textContent =
      [job.due, job.pay].filter(Boolean).join(" • ") || "—";
    row.querySelector(".job-source").textContent = job.source || "browser-extension";
    row.querySelector(".details-toggle").textContent = expandedJobs.has(job.id)
      ? "Hide"
      : "Details";

    detailsRow.hidden = !expandedJobs.has(job.id);
    detailsRow.querySelector(".job-details").innerHTML = `
      <div class="job-details-grid">
        <div><span>Client</span><strong>${escapeHtml(job.client || "—")}</strong></div>
        <div><span>Distance</span><strong>${escapeHtml(job.distance || "—")}</strong></div>
        <div><span>Due</span><strong>${escapeHtml(job.due || "—")}</strong></div>
        <div><span>Pay</span><strong>${escapeHtml(job.pay || "—")}</strong></div>
        <div class="job-details-notes"><span>Notes</span><strong>${escapeHtml(
          job.details || job.notes || "—"
        )}</strong></div>
      </div>
    `;

    jobsTableBody.appendChild(fragment);
  });

  updateCounts();
}

function updateCounts() {
  const selected = allJobs.filter((job) => job.selected).length;
  jobCount.textContent = String(allJobs.length);
  selectedCount.textContent = String(selected);
  selectAll.checked = filteredJobs.length > 0 && filteredJobs.every((job) => job.selected);
}

async function loadJobs() {
  setConnection("Loading");
  const response = await fetch("/api/jobs", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allJobs = (payload.jobs || []).map((job) => ({ ...job, selected: Boolean(job.selected) }));
  expandedJobs = new Set([...expandedJobs].filter((id) => allJobs.some((job) => job.id === id)));
  setConnection("Ready");
  render();
}

async function loadSourceConfig() {
  if (!sourceConfigForm) return;
  setSourceStatus("Loading");
  const response = await fetch("/api/source-config", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  sourceConfigForm.source_name.value = payload.source_name || "";
  sourceConfigForm.source_url.value = payload.login_url || payload.source_url || "";
  sourceConfigForm.data_url.value = payload.data_url || "";
  sourceConfigForm.source_username.value = payload.source_username || "";
  sourceConfigForm.source_password.value = "";
  setSourceStatus(payload.has_password ? "Saved" : "Needs password");
}

async function loadSourceStatus() {
  const response = await fetch("/api/source-status", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  const label = payload.message || payload.state || "Idle";
  setSourceStatus(label);
}

function openRoute() {
  const selected = getSelectedJobs();
  if (!selected.length) {
    alert("Select one or more jobs first.");
    return;
  }
  const stops = selected
    .map((job) => job.address || [job.city, job.state].filter(Boolean).join(", "))
    .filter(Boolean);
  const destination = stops.at(-1) || "";
  const origin = stops[0] || "";
  const mapsUrl = new URL("https://www.google.com/maps/dir/");
  if (origin) mapsUrl.searchParams.set("api", "1");
  if (origin) mapsUrl.searchParams.set("origin", origin);
  if (destination) mapsUrl.searchParams.set("destination", destination);
  if (stops.length > 2) {
    mapsUrl.searchParams.set("waypoints", stops.slice(1, -1).join("|"));
  }
  window.open(mapsUrl.toString(), "_blank", "noopener");
}

function exportCsv() {
  const rows = [["title", "address", "city", "state", "postcode", "source"]];
  getSelectedJobs().forEach((job) => {
    rows.push([job.title, job.address, job.city, job.state, job.postcode, job.source]);
  });
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "selected-jobs.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

refreshButton.addEventListener("click", (event) => {
  event.preventDefault();
  loadJobs();
});

routeButton.addEventListener("click", (event) => {
  event.preventDefault();
  openRoute();
});

exportButton.addEventListener("click", (event) => {
  event.preventDefault();
  exportCsv();
});

searchInput.addEventListener("input", render);

selectAll.addEventListener("change", (event) => {
  filteredJobs.forEach((job) => {
    job.selected = event.target.checked;
  });
  render();
});

if (logoutForm) {
  logoutForm.addEventListener("submit", () => {
    setConnection("Logged out");
  });
}

if (sourceConfigForm) {
  sourceConfigForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setSourceStatus("Saving");
    const response = await fetch("/api/source-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        source_name: sourceConfigForm.source_name.value.trim(),
        login_url: sourceConfigForm.source_url.value.trim(),
        data_url: sourceConfigForm.data_url.value.trim(),
        source_username: sourceConfigForm.source_username.value.trim(),
        source_password: sourceConfigForm.source_password.value,
      }),
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    const payload = await response.json();
    setSourceStatus(payload.config?.has_password ? "Saved" : "Needs password");
    sourceConfigForm.source_password.value = "";
  });
}

if (reloadSourceButton) {
  reloadSourceButton.addEventListener("click", () => {
    loadSourceConfig();
  });
}

if (openSourceButton) {
  openSourceButton.addEventListener("click", async () => {
    setSourceStatus("Opening browser");
    const response = await fetch("/api/source/open", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    await loadSourceStatus();
  });
}

if (scrapeNowButton) {
  scrapeNowButton.addEventListener("click", async () => {
    setSourceStatus("Syncing");
    const response = await fetch("/api/scrape", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    await loadJobs();
    await loadSourceStatus();
  });
}

loadJobs();
loadSourceConfig();
loadSourceStatus();
