const jobsTableBody = document.querySelector("#jobsTableBody");
const jobCount = document.querySelector("#jobCount");
const selectedCount = document.querySelector("#selectedCount");
const connectionState = document.querySelector("#connectionState");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const routeButton = document.querySelector("#routeButton");
const exportButton = document.querySelector("#exportButton");
const selectAll = document.querySelector("#selectAll");
const activeJobCount = document.querySelector("#activeJobCount");
const awaitingJobCount = document.querySelector("#awaitingJobCount");
const completedJobCount = document.querySelector("#completedJobCount");
const jobTabs = Array.from(document.querySelectorAll(".job-tab"));
const sourcePanel = document.querySelector("#sourcePanel");
const logoutForm = document.querySelector("#logoutForm");
const sourceConfigForm = document.querySelector("#sourceConfigForm");
const reloadSourceButton = document.querySelector("#reloadSourceButton");
const openSourceButton = document.querySelector("#openSourceButton");
const scrapeNowButton = document.querySelector("#scrapeNowButton");
const sourceStatus = document.querySelector("#sourceStatus");
const template = document.querySelector("#jobRowTemplate");
const routePlanStatus = document.querySelector("#routePlanStatus");
const routePlanOutput = document.querySelector("#routePlanOutput");
const transitOnestopId = document.querySelector("#transitOnestopId");
const originLat = document.querySelector("#originLat");
const originLon = document.querySelector("#originLon");
const useLocationButton = document.querySelector("#useLocationButton");
const importTransitButton = document.querySelector("#importTransitButton");
const planTransitButton = document.querySelector("#planTransitButton");

const storageKeys = {
  originLat: "route_planner_origin_lat",
  originLon: "route_planner_origin_lon",
  onestopId: "route_planner_transit_onestop_id",
};

let allJobs = [];
let filteredJobs = [];
let expandedJobs = new Set();
let activeTab = "active";

function setConnection(text) {
  connectionState.textContent = text;
}

function setSourceStatus(text) {
  if (sourceStatus) {
    sourceStatus.textContent = text;
  }
}

function setRoutePlanStatus(text) {
  if (routePlanStatus) {
    routePlanStatus.textContent = text;
  }
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

function fieldBlock(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function isCompletedJob(job) {
  return Boolean(
    job.is_completed || /(?:\bcompleted\b|\bdone\b|\bpaid\b)/i.test(String(job.status || ""))
  );
}

function normalizedWorkflowStatus(job) {
  const status = String(job.workflow_status || job.status || "").toLowerCase();
  if (status.includes("awaiting")) return "awaiting_payment";
  if (status.includes("completed") || status.includes("paid") || isCompletedJob(job)) return "completed";
  return "active";
}

function getSelectedJobs() {
  return filteredJobs.filter((job) => job.selected && !isCompletedJob(job));
}

function getPlanningJobs() {
  const selected = getSelectedJobs();
  if (selected.length) return selected;
  return allJobs.filter((job) => normalizedWorkflowStatus(job) !== "completed");
}

function loadStoredOrigin() {
  const lat = Number.parseFloat(localStorage.getItem(storageKeys.originLat) || "");
  const lon = Number.parseFloat(localStorage.getItem(storageKeys.originLon) || "");
  if (originLat && Number.isFinite(lat)) originLat.value = String(lat);
  if (originLon && Number.isFinite(lon)) originLon.value = String(lon);
  const onestop = localStorage.getItem(storageKeys.onestopId) || "";
  if (transitOnestopId && onestop) transitOnestopId.value = onestop;
}

function saveOrigin(lat, lon) {
  if (Number.isFinite(lat)) {
    localStorage.setItem(storageKeys.originLat, String(lat));
    if (originLat) originLat.value = String(lat);
  }
  if (Number.isFinite(lon)) {
    localStorage.setItem(storageKeys.originLon, String(lon));
    if (originLon) originLon.value = String(lon);
  }
}

function currentOrigin() {
  const lat = Number.parseFloat(originLat?.value || "");
  const lon = Number.parseFloat(originLon?.value || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function routeJobPayload(job) {
  return {
    id: job.id,
    title: job.title,
    client: job.client,
    address: job.address,
    city: job.city,
    state: job.state,
    postcode: job.postcode,
    lat: job.lat,
    lng: job.lng,
    source: job.source,
    source_url: job.source_url,
    info_url: job.info_url,
    due: job.due,
    pay: job.pay,
    status: job.status,
    workflow_status: job.workflow_status,
    is_completed: job.is_completed,
    details: job.details,
    detail_fields: job.detail_fields,
  };
}

function selectedJobIdsForPlan() {
  const selected = getSelectedJobs();
  if (selected.length) {
    return selected.map((job) => job.id);
  }
  return [];
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`;
}

function formatMetersFromKm(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value * 1000)} m`;
}

function buildMapsLink(origin, destination, mode) {
  if (!origin || !destination) return "";
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lon}`);
  url.searchParams.set("travelmode", mode || "transit");
  return url.toString();
}

function openJob(job) {
  const url = job.info_url || job.source_url || "https://www.jobslingerplus.com/Info";
  window.open(url, "_blank", "noopener");
}

function renderRoutePlan(plan) {
  if (!routePlanOutput) return;

  if (!plan || plan.ok === false) {
    routePlanOutput.innerHTML = `<div class="route-empty">No route plan yet.</div>`;
    return;
  }

  const summary = plan.summary || {};
  const origin = plan.origin || {};
  const route = Array.isArray(plan.route) ? plan.route : [];

  routePlanOutput.innerHTML = `
    <div class="route-summary-card">
      <strong>${escapeHtml(String(summary.jobs || 0))} jobs planned</strong>
      <span>Transit legs: ${escapeHtml(String(summary.transit_enabled || 0))} | Walk-only: ${escapeHtml(String(summary.walk_only || 0))} | No-route: ${escapeHtml(String(summary.no_route || 0))}</span>
      <span>Origin: ${escapeHtml(Number.isFinite(origin.lat) && Number.isFinite(origin.lon) ? `${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}` : "-")}</span>
    </div>
    <div class="route-list">
      ${route
        .map((step, index) => {
          const originStop = step.origin_stop?.name || step.origin_stop?.stop_id || "-";
          const destinationStop = step.destination_stop?.name || step.destination_stop?.stop_id || "-";
          const legItems = Array.isArray(step.legs)
            ? step.legs
                .map((leg) => {
                  const fromLabel = leg.from?.label || leg.from?.name || "Start";
                  const toLabel = leg.to?.label || leg.to?.name || "End";
                  return `
                    <li>
                      <span>${escapeHtml(leg.mode || "walk")}</span>
                      <strong>${escapeHtml(fromLabel)} -> ${escapeHtml(toLabel)}</strong>
                      <em>${escapeHtml(formatKm(leg.distance_km))}</em>
                    </li>
                  `;
                })
                .join("")
            : "";
          return `
            <article class="route-card ${escapeHtml(step.mode || "walk_only")}">
              <div class="route-card-head">
                <div>
                  <span class="route-card-index">Stop ${index + 1}</span>
                  <strong>${escapeHtml(step.title || "Job")}</strong>
                </div>
                <a class="route-link" href="${escapeHtml(step.route_url || "")}" target="_blank" rel="noreferrer">Open directions</a>
              </div>
              <div class="route-card-meta">
                <span>${escapeHtml(step.summary || "No summary")}</span>
                <span>Mode: ${escapeHtml(step.mode || "walk_only")}</span>
                <span>Direct: ${escapeHtml(formatKm(step.direct_distance_km))}</span>
                <span>Origin stop: ${escapeHtml(originStop)}</span>
                <span>Job stop: ${escapeHtml(destinationStop)}</span>
              </div>
              <div class="route-card-address">${escapeHtml([step.address, step.city, step.state, step.postcode].filter(Boolean).join(", "))}</div>
              <div class="route-card-legs">
                <strong>Legs</strong>
                <ul>${legItems || "<li><span>Notice</span><strong>No practical walk/transit legs were found for this job.</strong><em>Use rideshare later if needed.</em></li>"}</ul>
              </div>
              ${
                step.rideShareSuggested
                  ? '<div class="route-warning">No practical walk/transit route found. Rideshare fallback can be added later.</div>'
                  : ""
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

async function setJobStatus(job, status) {
  const response = await fetch("/api/jobs/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      job_id: job.id,
      status,
    }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.error || "Could not update job status");
    return;
  }
  await loadJobs();
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

function render() {
  const query = searchInput.value.trim().toLowerCase();
  filteredJobs = allJobs.filter((job) => {
    const workflow = normalizedWorkflowStatus(job);
    if (activeTab === "source") return false;
    if (activeTab !== "source" && workflow !== activeTab) return false;

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
      job.status,
    ]
      .join(" ")
      .toLowerCase();
    return !query || haystack.includes(query);
  });

  jobsTableBody.innerHTML = "";
  jobTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });
  if (sourcePanel) sourcePanel.hidden = activeTab === "source";

  filteredJobs.forEach((job) => {
    const fragment = template.content.cloneNode(true);
    const [row, detailsRow] = fragment.querySelectorAll("tr");
    const workflow = normalizedWorkflowStatus(job);
    const jobInfoUrl = job.info_url || job.source_url || "https://www.jobslingerplus.com/Info";

    row.classList.toggle("is-completed", workflow === "completed");
    row.classList.toggle("is-awaiting", workflow === "awaiting_payment");

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

    row.querySelector(".open-job").addEventListener("click", () => {
      openJob(job);
    });

    const statusButton = row.querySelector(".status-action");
    if (workflow === "active") {
      statusButton.textContent = "Mark submitted";
      statusButton.addEventListener("click", () => setJobStatus(job, "awaiting_payment"));
    } else if (workflow === "awaiting_payment") {
      statusButton.textContent = "Mark paid";
      statusButton.addEventListener("click", () => setJobStatus(job, "completed"));
    } else {
      statusButton.textContent = "Completed";
      statusButton.disabled = true;
    }

    row.querySelector(".job-title").textContent = job.title || "Job";
    row.querySelector(".job-address").textContent = [job.client, job.address].filter(Boolean).join(" - ") || "-";
    row.querySelector(".job-location").textContent =
      [job.distance, job.city, job.state, job.postcode].filter(Boolean).join(", ") || "-";
    row.querySelector(".job-duepay").textContent = [job.due, job.pay].filter(Boolean).join(" | ") || "-";
    row.querySelector(".job-source").textContent = job.source || "browser-extension";
    row.querySelector(".details-toggle").textContent = expandedJobs.has(job.id) ? "Hide" : "Details";

    detailsRow.hidden = !expandedJobs.has(job.id);
    const detailFields = job.detail_fields || {};
    detailsRow.querySelector(".job-details").innerHTML = `
      <div class="job-details-head">
        <div>
          <span class="job-details-kicker">Survey</span>
          <strong class="job-details-title">${escapeHtml(detailFields.survey || "-")}</strong>
        </div>
        <a class="job-details-link" href="${escapeHtml(jobInfoUrl)}" target="_blank" rel="noreferrer">
          Open job info
        </a>
      </div>
      <div class="job-details-grid">
        ${fieldBlock("Client", job.client || "-")}
        ${fieldBlock("Address", detailFields.address || job.address || "-")}
        ${fieldBlock("Distance", job.distance || "-")}
        ${fieldBlock("Due", detailFields.due || job.due || "-")}
        ${fieldBlock("Submit Due", detailFields.submit_due || "-")}
        ${fieldBlock("Do not shop before", detailFields.do_not_shop_before || "-")}
        ${fieldBlock("Shop Pay", detailFields.shop_pay || job.pay || "-")}
        ${fieldBlock("Bonus", detailFields.bonus || "-")}
        ${fieldBlock("Expenses up to", detailFields.expenses_up_to || "-")}
        ${fieldBlock("Special expenses", detailFields.special_expenses_up_to || "-")}
        ${fieldBlock("Contact", detailFields.contact || "-")}
      </div>
      <div class="job-details-notes">
        <span>Job description</span>
        <strong>${escapeHtml(job.details || job.notes || detailFields.raw || "-")}</strong>
      </div>
      <div class="job-details-meta">${escapeHtml([job.client, job.distance].filter(Boolean).join(" | "))}</div>
    `;

    jobsTableBody.appendChild(fragment);
  });

  updateCounts();
}

function updateCounts() {
  const selected = allJobs.filter((job) => job.selected).length;
  const activeCount = allJobs.filter((job) => normalizedWorkflowStatus(job) === "active").length;
  const awaitingCount = allJobs.filter((job) => normalizedWorkflowStatus(job) === "awaiting_payment").length;
  const completedCount = allJobs.filter((job) => normalizedWorkflowStatus(job) === "completed").length;
  jobCount.textContent = String(allJobs.length);
  selectedCount.textContent = String(selected);
  if (activeJobCount) activeJobCount.textContent = String(activeCount);
  if (awaitingJobCount) awaitingJobCount.textContent = String(awaitingCount);
  if (completedJobCount) completedJobCount.textContent = String(completedCount);
  selectAll.checked = filteredJobs.length > 0 && filteredJobs.every((job) => job.selected);
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
      row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")
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

async function importTransitFeed() {
  const onestopId = String(transitOnestopId?.value || "").trim();
  if (!onestopId) {
    setRoutePlanStatus("Enter a Transitland feed ID");
    return;
  }
  localStorage.setItem(storageKeys.onestopId, onestopId);
  setRoutePlanStatus("Importing feed");
  const response = await fetch("/api/import-gtfs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ onestop_id: onestopId }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "Import failed");
    return;
  }
  setRoutePlanStatus(`Imported ${payload.result?.stopsCount || 0} stops`);
}

async function planTransitRoute() {
  const onestopId = String(transitOnestopId?.value || "").trim();
  const origin = currentOrigin();
  const jobs = getPlanningJobs().map(routeJobPayload);

  if (!onestopId) {
    setRoutePlanStatus("Enter a Transitland feed ID");
    return;
  }
  if (!origin) {
    setRoutePlanStatus("Use your live location first");
    return;
  }
  if (!jobs.length) {
    setRoutePlanStatus("No jobs available to route");
    return;
  }

  localStorage.setItem(storageKeys.onestopId, onestopId);
  setRoutePlanStatus("Planning route");
  routePlanOutput.innerHTML = `<div class="route-empty">Building the route plan...</div>`;

  const response = await fetch("/api/route-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      onestop_id: onestopId,
      origin,
      selected_job_ids: selectedJobIdsForPlan(),
    }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const payload = await response.json();
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "Route planning failed");
    routePlanOutput.innerHTML = `<div class="route-empty">${escapeHtml(payload.error || "Route planning failed")}</div>`;
    return;
  }

  setRoutePlanStatus(`Planned ${payload.summary?.jobs || 0} jobs`);
  renderRoutePlan(payload);
}

function useLiveLocation() {
  if (!navigator.geolocation) {
    setRoutePlanStatus("Geolocation is not available in this browser");
    return;
  }

  setRoutePlanStatus("Getting live location");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = Number(position.coords.latitude);
      const lon = Number(position.coords.longitude);
      saveOrigin(lat, lon);
      setRoutePlanStatus("Live location saved");
    },
    (error) => {
      setRoutePlanStatus(error.message || "Could not read your location");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    }
  );
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

jobTabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab || "active";
    render();
  });
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

if (useLocationButton) {
  useLocationButton.addEventListener("click", useLiveLocation);
}

if (importTransitButton) {
  importTransitButton.addEventListener("click", importTransitFeed);
}

if (planTransitButton) {
  planTransitButton.addEventListener("click", planTransitRoute);
}

loadStoredOrigin();
renderRoutePlan(null);
loadJobs();
loadSourceConfig();
loadSourceStatus();
