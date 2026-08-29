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
const sourceConfigForm = document.querySelector("#sourceConfigForm");
const reloadSourceButton = document.querySelector("#reloadSourceButton");
const openSourceButton = document.querySelector("#openSourceButton");
const scrapeNowButton = document.querySelector("#scrapeNowButton");
const sourceStatus = document.querySelector("#sourceStatus");
const refreshBoardsButton = document.querySelector("#refreshBoardsButton");
const jobBoardsList = document.querySelector("#jobBoardsList");
const template = document.querySelector("#jobRowTemplate");
const routePlanStatus = document.querySelector("#routePlanStatus");
const routePlanOutput = document.querySelector("#routePlanOutput");
const routeLegOverlay = document.querySelector("#routeLegOverlay");
const transitOnestopId = document.querySelector("#transitOnestopId");
const originLat = document.querySelector("#originLat");
const originLon = document.querySelector("#originLon");
const useLocationButton = document.querySelector("#useLocationButton");
const placeOpenJobsButton = document.querySelector("#placeOpenJobsButton");
const importTransitButton = document.querySelector("#importTransitButton");
const importCtsZipButton = document.querySelector("#importCtsZipButton");
const planTransitButton = document.querySelector("#planTransitButton");
const planOptionSelect = document.querySelector("#planOptionSelect");
const corridorSelect = document.querySelector("#corridorSelect");
const routeSectionSelect = document.querySelector("#routeSectionSelect");
const allStopsSelectedButton = document.querySelector("#allStopsSelectedButton");
const transitPickerSummary = document.querySelector("#transitPickerSummary");
const routeMapElement = document.querySelector("#routeMap");
const routeModal = document.querySelector("#routeModal");
const routeModalMapElement = document.querySelector("#routeModalMap");
const routeModalSummary = document.querySelector("#routeModalSummary");
const routeModalStops = document.querySelector("#routeModalStops");

const storageKeys = {
  originLat: "route_planner_origin_lat",
  originLon: "route_planner_origin_lon",
  onestopId: "route_planner_transit_onestop_id",
};

const DEFAULT_TRANSIT_ONESTOP_ID = "o-clarksville~tn~us";
const LEGACY_TRANSIT_ONESTOP_IDS = new Map([
  ["f-clarksville~tn~us", DEFAULT_TRANSIT_ONESTOP_ID],
]);

let allJobs = [];
let filteredJobs = [];
let jobBoards = [];
let expandedJobs = new Set();
let activeTab = "active";
let routeMap = null;
let routeLayer = null;
let routeModalMap = null;
let routeModalLayer = null;
let planRefreshTimer = null;
let liveJobsEventSource = null;
let lastPlan = null;
let transitPickerData = null;
let transitEligibleJobIds = null;
let transitPickerRequestVersion = 0;
let transitSelection = {
  plan_id: "",
  corridor_ids: ["all-accessible-routes"],
  section_id: "all-selected-route-sections",
  stop_id: "all-stops-selected",
};

const ALL_ACCESSIBLE_ROUTES = "all-accessible-routes";
const ALL_SELECTED_ROUTE_SECTIONS = "all-selected-route-sections";
const ALL_STOPS_SELECTED = "all-stops-selected";

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
  if (status.includes("submitted")) return "awaiting_payment";
  if (status.includes("completed") || status.includes("paid") || isCompletedJob(job)) return "completed";
  if (status.includes("planned")) return "planned";
  if (status.includes("available")) return "available";
  return "active";
}

function isOpenAvailableJob(job) {
  const status = normalizedWorkflowStatus(job);
  return status === "active" || status === "available";
}

function getSelectedJobs() {
  return filteredJobs.filter((job) => job.selected && !isCompletedJob(job));
}

function isTransitEligible(job) {
  return !transitEligibleJobIds || transitEligibleJobIds.has(String(job.id));
}

function getPlanningJobs() {
  const selected = getSelectedJobs();
  const candidates = selected.length
    ? selected
    : allJobs.filter(isOpenAvailableJob);
  return candidates.filter(isTransitEligible);
}

function normalizeStoredOnestopId(value) {
  const onestopId = String(value || "").trim();
  if (!onestopId) return DEFAULT_TRANSIT_ONESTOP_ID;
  return LEGACY_TRANSIT_ONESTOP_IDS.get(onestopId) || onestopId;
}

function loadStoredOrigin() {
  const lat = Number.parseFloat(localStorage.getItem(storageKeys.originLat) || "");
  const lon = Number.parseFloat(localStorage.getItem(storageKeys.originLon) || "");
  if (originLat && Number.isFinite(lat)) originLat.value = String(lat);
  if (originLon && Number.isFinite(lon)) originLon.value = String(lon);
  const onestop = normalizeStoredOnestopId(localStorage.getItem(storageKeys.onestopId));
  if (transitOnestopId) transitOnestopId.value = onestop;
  localStorage.setItem(storageKeys.onestopId, onestop);
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

async function refreshLiveOrigin() {
  if (!navigator.geolocation) {
    setRoutePlanStatus("Geolocation is not available in this browser");
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);
        saveOrigin(lat, lon);
        setRoutePlanStatus("Current location saved");
        scheduleAutoPlanRoute();
        resolve({ lat, lon });
      },
      (error) => {
        setRoutePlanStatus(error.message || "Could not read your location");
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  });
}

function currentOrigin() {
  const lat = Number.parseFloat(originLat?.value || "");
  const lon = Number.parseFloat(originLon?.value || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function selectOption(value, label, selected = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

function selectedValues(select) {
  return Array.from(select?.selectedOptions || []).map((option) => option.value);
}

function setTransitPickerSummary(text) {
  if (transitPickerSummary) {
    transitPickerSummary.textContent = text;
  }
}

function sectionPickerLabel(section) {
  return [section.label, section.corridor_name || section.route_label, section.direction]
    .filter(Boolean)
    .join(" | ");
}

function stopPickerLabel(stop) {
  return stop.location ? `${stop.stop_name} - ${stop.location}` : stop.stop_name;
}

function renderJobBoards() {
  if (!jobBoardsList) return;
  if (!jobBoards.length) {
    jobBoardsList.innerHTML = `<div class="job-board-card muted">No linked board status loaded yet.</div>`;
    return;
  }

  jobBoardsList.innerHTML = jobBoards
    .map((board) => {
      const canOpen = board.board_url || board.login_url;
      const status = board.status === "linked" ? "Linked" : "Needs phone connection";
      const synced = board.last_synced_at ? new Date(board.last_synced_at).toLocaleString() : "Not synced yet";
      return `
        <article class="job-board-card ${escapeHtml(board.status || "")}">
          <div>
            <span class="job-board-status">${escapeHtml(status)} | ${escapeHtml(board.connection_state || "unknown")}</span>
            <strong>${escapeHtml(board.display_name || "Job board")}</strong>
            <p>${escapeHtml(board.last_message || board.source_label || "")}</p>
          </div>
          <div class="job-board-counts">
            <span><strong>${escapeHtml(String(board.open_available_count || 0))}</strong> open</span>
            <span><strong>${escapeHtml(String(board.mapped_available_count || 0))}</strong> mapped</span>
            <span><strong>${escapeHtml(String(board.total_seen_count || 0))}</strong> seen</span>
          </div>
          <div class="job-board-footer">
            <span>Last sync: ${escapeHtml(synced)}</span>
            ${canOpen ? `<a href="${escapeHtml(board.board_url || board.login_url)}" target="_blank" rel="noreferrer">Open board</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadJobBoards() {
  if (!jobBoardsList) return;
  const response = await fetch("/api/job-boards", { credentials: "include" });
  if (response.status === 401) return;
  const payload = await response.json().catch(() => ({}));
  jobBoards = Array.isArray(payload.boards) ? payload.boards : [];
  renderJobBoards();
}

function renderTransitPicker(picker) {
  transitPickerData = picker;
  const plans = Array.isArray(picker?.plan_options) ? picker.plan_options : [];
  const corridors = Array.isArray(picker?.corridors) ? picker.corridors : [];
  const sections = Array.isArray(picker?.sections) ? picker.sections : [];
  const stops = Array.isArray(picker?.stops) ? picker.stops : [];

  if (!transitSelection.plan_id || !plans.some((plan) => plan.id === transitSelection.plan_id)) {
    transitSelection.plan_id = picker?.selection?.plan_id || plans[0]?.id || "";
  }
  if (!Array.isArray(transitSelection.corridor_ids) || !transitSelection.corridor_ids.length) {
    transitSelection.corridor_ids = [ALL_ACCESSIBLE_ROUTES];
  }

  if (planOptionSelect) {
    planOptionSelect.replaceChildren(
      ...plans.map((plan) => selectOption(plan.id, plan.label, plan.id === transitSelection.plan_id)),
    );
    planOptionSelect.disabled = !plans.length;
  }

  if (corridorSelect) {
    const selectedCorridorIds = transitSelection.corridor_ids;
    const knownCorridorIds = new Set(corridors.map((corridor) => corridor.route_id));
    if (
      !selectedCorridorIds.includes(ALL_ACCESSIBLE_ROUTES) &&
      !selectedCorridorIds.some((id) => knownCorridorIds.has(id))
    ) {
      transitSelection.corridor_ids = [ALL_ACCESSIBLE_ROUTES];
    }

    corridorSelect.replaceChildren(
      selectOption(
        ALL_ACCESSIBLE_ROUTES,
        "All accessible routes in this plan",
        transitSelection.corridor_ids.includes(ALL_ACCESSIBLE_ROUTES),
      ),
      ...corridors.map((corridor) =>
        selectOption(
          corridor.route_id,
          corridor.label,
          transitSelection.corridor_ids.includes(corridor.route_id),
        ),
      ),
    );
    corridorSelect.disabled = !picker?.verified_schedule || !corridors.length;
  }

  if (routeSectionSelect) {
    const allSectionsOption = selectOption(
      ALL_SELECTED_ROUTE_SECTIONS,
      "All selected route sections",
      transitSelection.section_id === ALL_SELECTED_ROUTE_SECTIONS && transitSelection.stop_id === ALL_STOPS_SELECTED,
    );
    routeSectionSelect.replaceChildren(allSectionsOption);

    if (sections.length) {
      const sectionGroup = document.createElement("optgroup");
      sectionGroup.label = "Verified route sections";
      sections.forEach((section) => {
        sectionGroup.appendChild(
          selectOption(
            `section:${section.id}`,
            sectionPickerLabel(section),
            transitSelection.section_id === section.id,
          ),
        );
      });
      routeSectionSelect.appendChild(sectionGroup);
    }

    if (stops.length) {
      const stopGroup = document.createElement("optgroup");
      stopGroup.label = "Individual verified stops";
      stops.forEach((stop) => {
        stopGroup.appendChild(
          selectOption(
            `stop:${stop.stop_id}`,
            stopPickerLabel(stop),
            transitSelection.stop_id === stop.stop_id,
          ),
        );
      });
      routeSectionSelect.appendChild(stopGroup);
    }

    const chosenValue =
      transitSelection.stop_id && transitSelection.stop_id !== ALL_STOPS_SELECTED
        ? `stop:${transitSelection.stop_id}`
        : transitSelection.section_id && transitSelection.section_id !== ALL_SELECTED_ROUTE_SECTIONS
        ? `section:${transitSelection.section_id}`
        : ALL_SELECTED_ROUTE_SECTIONS;
    if (!Array.from(routeSectionSelect.options).some((option) => option.value === chosenValue)) {
      transitSelection.section_id = ALL_SELECTED_ROUTE_SECTIONS;
      transitSelection.stop_id = ALL_STOPS_SELECTED;
      routeSectionSelect.value = ALL_SELECTED_ROUTE_SECTIONS;
    }
    routeSectionSelect.disabled = !picker?.verified_schedule || (!sections.length && !stops.length);
  }

  if (allStopsSelectedButton) {
    allStopsSelectedButton.disabled = !picker?.verified_schedule || !stops.length;
    allStopsSelectedButton.classList.toggle("is-active", transitSelection.stop_id === ALL_STOPS_SELECTED);
  }

  transitEligibleJobIds = new Set((picker?.job_ids || []).map((jobId) => String(jobId)));
  if (!picker?.imported) {
    setTransitPickerSummary("No cached GTFS schedule is loaded for this feed. Import a verified feed before choosing a route or stop.");
  } else if (!picker?.verified_schedule) {
    setTransitPickerSummary("This feed has no verified routes, trips, and stop times together, so the planner will not create route sections.");
  } else if (!corridors.length) {
    setTransitPickerSummary("Verified schedule loaded, but this plan has no jobs with verified route, section, or stop access.");
  } else {
    const sourceLabel = picker.source_label || "Scheduled estimate";
    setTransitPickerSummary(
      `${sourceLabel}: ${corridors.length} accessible corridors, ${sections.length} selected sections, ${stops.length} verified stops, ${picker.counts?.accessible_jobs || 0} matching jobs.`,
    );
  }
}

async function loadTransitPicker() {
  const onestopId = String(transitOnestopId?.value || "").trim();
  if (!onestopId) {
    setTransitPickerSummary("Enter a Transitland feed ID to load verified route and stop choices.");
    return;
  }

  const requestVersion = ++transitPickerRequestVersion;

  const params = new URLSearchParams({
    onestop_id: onestopId,
    plan_id: transitSelection.plan_id,
    section_id: transitSelection.section_id,
    stop_id: transitSelection.stop_id,
  });
  transitSelection.corridor_ids.forEach((corridorId) => params.append("corridor_id", corridorId));
  const response = await fetch(`/api/transit-picker?${params.toString()}`, { credentials: "include" });
  if (response.status === 401) return;
  const payload = await response.json().catch(() => ({}));
  if (requestVersion !== transitPickerRequestVersion) return;
  if (!response.ok) {
    setTransitPickerSummary(payload.error || "Could not load verified transit choices.");
    return;
  }
  renderTransitPicker(payload);
}

function resetTransitRouteScope() {
  transitSelection.corridor_ids = [ALL_ACCESSIBLE_ROUTES];
  transitSelection.section_id = ALL_SELECTED_ROUTE_SECTIONS;
  transitSelection.stop_id = ALL_STOPS_SELECTED;
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
    plan_ids: job.plan_ids || job.planIds,
    transit_access: job.transit_access || job.transitAccess,
    accessible_route_ids: job.accessible_route_ids || job.accessibleRouteIds,
    accessible_section_ids: job.accessible_section_ids || job.accessibleSectionIds,
    accessible_stop_ids: job.accessible_stop_ids || job.accessibleStopIds,
  };
}

function selectedJobIdsForPlan() {
  const selected = getSelectedJobs().filter(isTransitEligible);
  if (selected.length) {
    return selected.map((job) => job.id);
  }
  return [];
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`;
}

function formatMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? `${Math.round(minutes)} min` : "Not provided";
}

function formatMoneyCents(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents <= 0) return "-";
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

function transitDetailsHtml(step) {
  const details = step?.transit_details;
  if (!details) {
    return `
      <section class="route-transit-details route-transit-details-empty">
        <strong>No verified scheduled transit leg</strong>
        <span>Walking or fallback status is shown because the selected GTFS data did not verify a route connection.</span>
      </section>
    `;
  }

  const routeNumber = details.route_number || details.route_short_name || "";
  const location = (value) => value || "Not provided in GTFS";
  return `
    <section class="route-transit-details">
      <div class="route-transit-details-head">
        <strong>${escapeHtml(routeNumber ? `Route ${routeNumber}` : "Verified transit")}</strong>
        <span>${escapeHtml(details.source_label || "Scheduled estimate")}</span>
      </div>
      <dl class="route-transit-details-grid">
        <div><dt>Direction</dt><dd>${escapeHtml(location(details.direction))}</dd></div>
        <div><dt>Boarding stop</dt><dd>${escapeHtml(location(details.boarding_stop_name))}</dd></div>
        <div><dt>Boarding location</dt><dd>${escapeHtml(location(details.boarding_stop_location))}</dd></div>
        <div><dt>Scheduled pickup</dt><dd>${escapeHtml(location(details.scheduled_pickup_time))}</dd></div>
        <div><dt>Exit stop</dt><dd>${escapeHtml(location(details.exit_stop_name))}</dd></div>
        <div><dt>Exit location</dt><dd>${escapeHtml(location(details.exit_stop_location))}</dd></div>
        <div><dt>Walk to job</dt><dd>${escapeHtml(formatMinutes(details.walk_time_minutes))}</dd></div>
        <div><dt>Job work time</dt><dd>${escapeHtml(formatMinutes(details.job_work_time_minutes))}</dd></div>
        <div><dt>Buffer / risk</dt><dd>${escapeHtml(location(details.buffer_risk_label))}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(details.source_label || "Scheduled estimate")}</dd></div>
      </dl>
    </section>
  `;
}

function formatMetersFromKm(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value * 1000)} m`;
}

function buildMapsLink(origin, destination, mode) {
  if (!origin || !destination) return "";
  const url = new URL(window.location.origin);
  url.pathname = "/route";
  url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lon}`);
  url.searchParams.set("travelmode", mode || "transit");
  return url.toString();
}

function openJob(job) {
  const url = job.info_url || job.source_url || "https://www.jobslingerplus.com/Info";
  window.open(url, "_blank", "noopener");
}

function ensureRouteMap() {
  if (!routeMapElement || typeof L === "undefined") return null;
  if (routeMap) return routeMap;
  routeMap = L.map(routeMapElement, {
    zoomControl: true,
    preferCanvas: true,
  }).setView([36.5298, -87.3595], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(routeMap);
  routeLayer = L.layerGroup().addTo(routeMap);
  return routeMap;
}

function mapPointFromJob(job) {
  const lat = Number(job?.lat);
  const lon = Number(job?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, label: job.title || "Job" };
}

function providerLabel(job) {
  return job.provider_id || job.source || "linked board";
}

function addAvailableJobMarkers(layer, bounds, plannedJobIds = new Set()) {
  allJobs
    .filter((job) => isOpenAvailableJob(job) && !plannedJobIds.has(String(job.id)))
    .forEach((job) => {
      const point = mapPointFromJob(job);
      if (!point) return;
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: 9,
        color: "#052e16",
        weight: 2,
        fillColor: "#39ff14",
        fillOpacity: 0.92,
      }).addTo(layer);
      marker.bindPopup(
        `<strong>${escapeHtml(job.title || "Available job")}</strong><br/>` +
          `${escapeHtml(providerLabel(job))}<br/>` +
          `${escapeHtml([job.address, job.city, job.state].filter(Boolean).join(", "))}<br/>` +
          `${escapeHtml([job.due, job.pay].filter(Boolean).join(" | "))}`
      );
      bounds.push([point.lat, point.lon]);
    });
}

function duePriorityClass(step) {
  const rank = Number(step?.due_priority?.rank ?? 4);
  if (rank <= 0) return "overdue";
  if (rank === 1) return "today";
  if (rank === 2) return "tomorrow";
  return "later";
}

function priorityLabel(step) {
  const rank = Number(step?.due_priority?.rank ?? 4);
  if (rank <= 0) return "Overdue";
  if (rank === 1) return "Today";
  if (rank === 2) return "Tomorrow";
  return "Later";
}

function openRouteModal() {
  if (!routeModal) return;
  routeModal.classList.add("is-open");
  routeModal.setAttribute("aria-hidden", "false");
  ensureRouteModalMap();
  if (lastPlan) {
    renderRouteModal(lastPlan);
  }
}

function closeRouteModal() {
  if (!routeModal) return;
  routeModal.classList.remove("is-open");
  routeModal.setAttribute("aria-hidden", "true");
}

function ensureRouteModalMap() {
  if (!routeModalMapElement || typeof L === "undefined") return null;
  if (routeModalMap) return routeModalMap;
  routeModalMap = L.map(routeModalMapElement, {
    zoomControl: true,
    preferCanvas: true,
  }).setView([36.5298, -87.3595], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(routeModalMap);
  routeModalLayer = L.layerGroup().addTo(routeModalMap);
  return routeModalMap;
}

function renderRouteModal(plan) {
  const map = ensureRouteModalMap();
  if (!routeModalSummary || !routeModalStops) return;
  if (!plan || !Array.isArray(plan.route)) {
    routeModalSummary.innerHTML = `<div class="route-modal-summary-card"><strong>No planned route</strong><span>Plan a route to open the full-screen map.</span></div>`;
    routeModalStops.innerHTML = "";
    if (map && routeModalLayer) routeModalLayer.clearLayers();
    return;
  }

  if (map && routeModalLayer) {
    routeModalLayer.clearLayers();
    const route = plan.route;
    const origin = plan.origin && Number.isFinite(plan.origin.lat) && Number.isFinite(plan.origin.lon)
      ? { lat: plan.origin.lat, lon: plan.origin.lon, label: "Live location" }
      : currentOrigin();
    const points = [];
    if (origin) {
      L.marker([origin.lat, origin.lon]).addTo(routeModalLayer).bindPopup("<strong>Start</strong>");
      points.push([origin.lat, origin.lon]);
    }
    route.forEach((step, index) => {
      const point = mapPointFromJob(step.to || step.destination || step);
      if (!point) return;
      const chip = priorityLabel(step);
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: index === 0 ? 14 : 11,
        color: "#ffffff",
        weight: 2,
        fillColor: duePriorityClass(step) === "overdue" ? "#dc2626" : duePriorityClass(step) === "today" ? "#ea580c" : duePriorityClass(step) === "tomorrow" ? "#2563eb" : "#0f766e",
        fillOpacity: 0.95,
      }).addTo(routeModalLayer);
      marker.bindPopup(`<strong>${escapeHtml(step.title || `Stop ${index + 1}`)}</strong><br/>${escapeHtml(chip)}<br/>${escapeHtml([step.address, step.city, step.state].filter(Boolean).join(", "))}`);
      points.push([point.lat, point.lon]);
    });
    if (points.length > 1) {
      L.polyline(points, { color: "#2563eb", weight: 6, opacity: 0.9 }).addTo(routeModalLayer);
      map.fitBounds(points, { padding: [28, 28] });
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    }
  }

  const summary = plan.summary || {};
  routeModalSummary.innerHTML = `
    <div class="route-modal-summary-card">
      <strong>${escapeHtml(String(summary.jobs || 0))} planned jobs</strong>
      <span>Estimated route pay: ${escapeHtml(formatMoneyCents(summary.estimated_pay_cents))}</span>
      <span>${escapeHtml(String(summary.transit_enabled || 0))} transit legs | ${escapeHtml(String(summary.walk_only || 0))} walk-only | ${escapeHtml(String(summary.no_route || 0))} no-route</span>
    </div>
  `;

  routeModalStops.innerHTML = plan.route
    .map((step, index) => {
      const dueClass = duePriorityClass(step);
      const providerUrl = step.info_url || step.source_url || "https://www.jobslingerplus.com/Info";
      const routeUrl = step.route_url || "";
      const originStop = step.origin_stop?.name || step.origin_stop?.stop_id || "-";
      const destinationStop = step.destination_stop?.name || step.destination_stop?.stop_id || "-";
      const originStops = Array.isArray(step.origin_stop_candidates) ? step.origin_stop_candidates : [];
      const destinationStops = Array.isArray(step.destination_stop_candidates) ? step.destination_stop_candidates : [];
      const legText = Array.isArray(step.legs)
        ? step.legs
            .map((leg) => `${leg.mode || "walk"} ${formatKm(leg.distance_km)}`)
            .join(" • ")
        : "No leg details";
      return `
        <article class="route-modal-stop ${escapeHtml(dueClass)}">
          <div class="route-modal-stop-head">
            <div>
              <span class="route-card-index">Itinerary job ${index + 1}</span>
              <strong>${escapeHtml(step.title || "Job")}</strong>
              <div class="route-modal-stop-meta">
                <span class="route-modal-chip ${escapeHtml(dueClass)}">${escapeHtml(priorityLabel(step))}</span>
                <span class="route-modal-chip">${escapeHtml(step.mode || "walk_only")}</span>
              </div>
            </div>
          </div>
          <div>${escapeHtml(step.summary || "No summary")}</div>
          <div class="route-card-address">${escapeHtml([step.address, step.city, step.state, step.postcode].filter(Boolean).join(", "))}</div>
          ${transitDetailsHtml(step)}
          <div class="route-modal-stop-meta">
            <span class="route-modal-chip">${escapeHtml(step.estimated_minutes ? `${step.estimated_minutes} min` : "-")}</span>
            <span class="route-modal-chip">${escapeHtml(`Pay: ${formatMoneyCents(step.estimated_pay_cents)}`)}</span>
            <span class="route-modal-chip">${escapeHtml(step.due_date ? new Date(step.due_date).toLocaleDateString() : step.due || "-")}</span>
            <span class="route-modal-chip">${escapeHtml(`Origin stop: ${originStop}`)}</span>
            <span class="route-modal-chip">${escapeHtml(`Job stop: ${destinationStop}`)}</span>
          </div>
          <div class="route-modal-bus">
            <strong>Nearby transit</strong>
            <div class="route-modal-bus-grid">
              <div>
                <span>From current leg</span>
                <ul>
                  ${
                    originStops.length
                      ? originStops
                          .map((stop) => `<li>${escapeHtml(stop.name || stop.stop_id || "-")}</li>`)
                          .join("")
                      : "<li>No nearby stops found</li>"
                  }
                </ul>
              </div>
              <div>
                <span>At job</span>
                <ul>
                  ${
                    destinationStops.length
                      ? destinationStops
                          .map((stop) => `<li>${escapeHtml(stop.name || stop.stop_id || "-")}</li>`)
                          .join("")
                      : "<li>No nearby stops found</li>"
                  }
                </ul>
              </div>
            </div>
          </div>
          <div>${escapeHtml(legText)}</div>
          <div class="route-modal-stop-links">
            <a href="${escapeHtml(providerUrl)}" target="_blank" rel="noreferrer">Open provider</a>
            ${routeUrl ? `<a href="${escapeHtml(routeUrl)}" target="_blank" rel="noreferrer">Open directions</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRouteMap(plan) {
  const map = ensureRouteMap();
  if (!map || !routeLayer) return;
  routeLayer.clearLayers();

  const bounds = [];
  const origin = plan?.origin && Number.isFinite(plan.origin.lat) && Number.isFinite(plan.origin.lon)
    ? { lat: plan.origin.lat, lon: plan.origin.lon, label: "Live location" }
    : currentOrigin();

  if (origin) {
    const marker = L.marker([origin.lat, origin.lon]).addTo(routeLayer);
    marker.bindPopup(`<strong>Start</strong><br/>${escapeHtml(origin.label || "Live location")}`);
    bounds.push([origin.lat, origin.lon]);
  }

  const route = Array.isArray(plan?.route) ? plan.route : [];
  const plannedJobIds = new Set(route.map((step) => String(step.id || step.job_id || "")).filter(Boolean));
  addAvailableJobMarkers(routeLayer, bounds, plannedJobIds);

  route.forEach((step, index) => {
    const point = mapPointFromJob(step.to || step.destination || step);
    if (!point) return;
    const priority = duePriorityClass(step);
    const colors = {
      overdue: "#dc2626",
      today: "#ea580c",
      tomorrow: "#2563eb",
      later: "#0f766e",
    };
    const marker = L.circleMarker([point.lat, point.lon], {
      radius: index === 0 ? 13 : 10,
      color: "#ffffff",
      weight: 2,
      fillColor: colors[priority] || "#0f766e",
      fillOpacity: 0.95,
    }).addTo(routeLayer);
    marker.bindPopup(
      `<strong>${escapeHtml(step.title || `Stop ${index + 1}`)}</strong><br/>` +
        `${escapeHtml(priorityLabel(step))}<br/>` +
        `${escapeHtml([step.address, step.city, step.state].filter(Boolean).join(", "))}`
    );
    bounds.push([point.lat, point.lon]);
  });

  if (route.length > 1) {
    const polylinePoints = route
      .map((step) => mapPointFromJob(step.to || step.destination || step))
      .filter(Boolean)
      .map((point) => [point.lat, point.lon]);
    if (origin) {
      polylinePoints.unshift([origin.lat, origin.lon]);
    }
    if (polylinePoints.length >= 2) {
      L.polyline(polylinePoints, {
        color: "#1d4ed8",
        weight: 6,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(routeLayer);
    }
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
}

function renderRouteLegOverlay(plan) {
  if (!routeLegOverlay) return;
  if (!plan || !Array.isArray(plan.route) || !plan.route.length) {
    routeLegOverlay.innerHTML = `
      <strong>No active route</strong>
      <span>Select jobs and plan a route to see turn-by-turn steps here.</span>
    `;
    return;
  }

  const current = plan.route[0];
  const nextStop = plan.route[1];
  const legSummary = Array.isArray(current.legs)
    ? current.legs
        .map((leg) => `${leg.mode || "walk"}: ${formatKm(leg.distance_km)}`)
        .join(" | ")
    : "No leg details";

  routeLegOverlay.innerHTML = `
    <strong>Current leg</strong>
    <span>${escapeHtml(current.title || "Job")}</span>
    <em>${escapeHtml(current.summary || "Route step ready")}</em>
    <span>${escapeHtml(legSummary)}</span>
    <span>${escapeHtml(nextStop ? `Next job: ${nextStop.title || "Job"}` : "Last stop in this route")}</span>
  `;
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
  lastPlan = plan;
  renderRouteMap(plan);
  renderRouteLegOverlay(plan);

  routePlanOutput.innerHTML = `
    <div class="route-summary-card">
      <strong>${escapeHtml(String(summary.jobs || 0))} jobs planned</strong>
      <span>Estimated route pay: ${escapeHtml(formatMoneyCents(summary.estimated_pay_cents))}</span>
      <span>Transit legs: ${escapeHtml(String(summary.transit_enabled || 0))} | Walk-only: ${escapeHtml(String(summary.walk_only || 0))} | No-route: ${escapeHtml(String(summary.no_route || 0))}</span>
      <span>Transit source: ${escapeHtml(summary.source_label || "No verified schedule loaded")}</span>
      <span>Origin: ${escapeHtml(Number.isFinite(origin.lat) && Number.isFinite(origin.lon) ? `${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}` : "-")}</span>
      ${summary.selection_message ? `<span>${escapeHtml(summary.selection_message)}</span>` : ""}
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
            <article class="route-card ${escapeHtml(step.mode || "walk_only")} ${escapeHtml(duePriorityClass(step))}">
              <div class="route-card-head">
                <div>
                  <span class="route-card-index">Itinerary job ${index + 1}</span>
                  <strong>${escapeHtml(step.title || "Job")}</strong>
                  <span class="route-priority-badge">${escapeHtml(priorityLabel(step))}</span>
                </div>
              </div>
              <div class="route-card-meta">
                <span>${escapeHtml(step.summary || "No summary")}</span>
                <span>Mode: ${escapeHtml(step.mode || "walk_only")}</span>
                <span>Direct: ${escapeHtml(formatKm(step.direct_distance_km))}</span>
                <span>Time: ${escapeHtml(step.estimated_minutes ? `${step.estimated_minutes} min` : "-")}</span>
                <span>Pay: ${escapeHtml(formatMoneyCents(step.estimated_pay_cents))}</span>
                <span>Due: ${escapeHtml(step.due_date ? new Date(step.due_date).toLocaleDateString() : step.due || "-")}</span>
                <span>Board: ${escapeHtml(originStop)}</span>
                <span>Exit: ${escapeHtml(destinationStop)}</span>
              </div>
              <div class="route-card-address">${escapeHtml([step.address, step.city, step.state, step.postcode].filter(Boolean).join(", "))}</div>
              ${transitDetailsHtml(step)}
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
    return;
  }
  const payload = await response.json();
  allJobs = (payload.jobs || []).map((job) => ({ ...job, selected: Boolean(job.selected) }));
  expandedJobs = new Set([...expandedJobs].filter((id) => allJobs.some((job) => job.id === id)));
  setConnection("Ready");
  render();
  renderRouteMap(lastPlan);
  await loadJobBoards().catch(() => {
    renderJobBoards();
  });
  await loadTransitPicker().catch(() => {
    setTransitPickerSummary("Could not refresh verified transit choices after loading jobs.");
  });
  scheduleAutoPlanRoute();
}

function scheduleAutoPlanRoute() {
  window.clearTimeout(planRefreshTimer);
  planRefreshTimer = window.setTimeout(() => {
    autoPlanRoute().catch(() => {});
  }, 250);
}

function connectLiveJobEvents() {
  if (!window.EventSource || liveJobsEventSource) return;
  liveJobsEventSource = new EventSource("/api/events");
  liveJobsEventSource.addEventListener("jobs", () => {
    loadJobs().catch(() => {
      setConnection("Sync error");
    });
  });
  liveJobsEventSource.addEventListener("status", () => {
    loadSourceStatus().catch(() => {});
  });
  liveJobsEventSource.onerror = () => {
    setConnection("Reconnecting");
  };
  setConnection("Live sync");
}

async function loadSourceConfig() {
  if (!sourceConfigForm) return;
  setSourceStatus("Loading");
  const response = await fetch("/api/source-config", { credentials: "include" });
  if (response.status === 401) {
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
  if (sourcePanel) sourcePanel.hidden = activeTab !== "source";

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
  activeTab = "active";
  render();
  planTransitRoute().then(() => openRouteModal());
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
    return;
  }
  const payload = await response.json();
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "Import failed");
    return;
  }
  setRoutePlanStatus(
    `Imported ${payload.result?.routesCount || 0} verified routes and ${payload.result?.stopsCount || 0} stops`,
  );
  await loadTransitPicker();
}

async function importCtsZip() {
  setRoutePlanStatus("Loading CTS zip");
  const response = await fetch("/api/import-cts-zip", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({}),
  });
  if (response.status === 401) return;
  const payload = await response.json();
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "CTS zip import failed");
    return;
  }
  setRoutePlanStatus(
    `Loaded CTS zip: ${payload.result?.routesCount || 0} verified routes and ${payload.result?.stopsCount || 0} stops`,
  );
  await loadTransitPicker();
}

async function placeOpenJobsOnMap() {
  if (!placeOpenJobsButton) return;
  const originalText = placeOpenJobsButton.textContent;
  placeOpenJobsButton.disabled = true;
  placeOpenJobsButton.textContent = "Placing jobs";
  setRoutePlanStatus("Placing open jobs on map");

  const response = await fetch("/api/jobs/geocode-open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ limit: 25 }),
  });
  if (response.status === 401) return;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "Could not place open jobs");
    placeOpenJobsButton.disabled = false;
    placeOpenJobsButton.textContent = originalText;
    return;
  }

  setRoutePlanStatus(`Mapped ${payload.updated || 0} open jobs`);
  await loadJobs();
  placeOpenJobsButton.disabled = false;
  placeOpenJobsButton.textContent = originalText;
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
    setRoutePlanStatus(
      transitPickerData?.verified_schedule
        ? "No jobs have verified access to the selected route, section, or stop"
        : "No jobs available to route",
    );
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
      transit_selection: transitSelection,
    }),
  });

  if (response.status === 401) {
    return;
  }

  const payload = await response.json();
  if (!response.ok) {
    setRoutePlanStatus(payload.error || "Route planning failed");
    routePlanOutput.innerHTML = `<div class="route-empty">${escapeHtml(payload.error || "Route planning failed")}</div>`;
    return;
  }

  setRoutePlanStatus(payload.summary?.selection_message || `Planned ${payload.summary?.jobs || 0} jobs`);
  renderRoutePlan(payload);
  renderRouteModal(payload);
}

async function autoPlanRoute() {
  const jobs = getPlanningJobs();
  const origin = currentOrigin();
  const onestopId = String(transitOnestopId?.value || "").trim();
  if (!jobs.length || !origin || !onestopId) return;
  if (routePlanStatus && !/planning/i.test(routePlanStatus.textContent || "")) {
    setRoutePlanStatus("Updating route");
  }
  await planTransitRoute().catch(() => {});
}

function useLiveLocation() {
  setRoutePlanStatus("Getting live location");
  refreshLiveOrigin().then((result) => {
    if (result) {
      setRoutePlanStatus("Live location saved");
    }
  });
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
    if (response.status === 401) return;
    const payload = await response.json();
    setSourceStatus(payload.config?.has_password ? "Saved" : "Needs password");
    sourceConfigForm.source_password.value = "";
  });
}

if (sourcePanel) {
  sourcePanel.hidden = true;
}

if (reloadSourceButton) {
  reloadSourceButton.addEventListener("click", () => {
    loadSourceConfig();
    loadJobBoards().catch(() => {});
  });
}

if (refreshBoardsButton) {
  refreshBoardsButton.addEventListener("click", () => {
    loadJobBoards().catch(() => {
      renderJobBoards();
    });
  });
}

if (openSourceButton) {
  openSourceButton.addEventListener("click", async () => {
    setSourceStatus("Opening browser");
    const response = await fetch("/api/source/open", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 401) return;
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
    if (response.status === 401) return;
    await loadJobs();
    await loadSourceStatus();
    await loadJobBoards().catch(() => {});
  });
}

if (useLocationButton) {
  useLocationButton.addEventListener("click", useLiveLocation);
}

if (placeOpenJobsButton) {
  placeOpenJobsButton.addEventListener("click", placeOpenJobsOnMap);
}

if (transitOnestopId) {
  transitOnestopId.addEventListener("change", () => {
    const onestopId = normalizeStoredOnestopId(transitOnestopId.value);
    transitOnestopId.value = onestopId;
    if (onestopId) localStorage.setItem(storageKeys.onestopId, onestopId);
    resetTransitRouteScope();
    transitEligibleJobIds = null;
    loadTransitPicker().catch(() => {
      setTransitPickerSummary("Could not load verified transit choices for this feed.");
    }).finally(scheduleAutoPlanRoute);
  });
}

if (planOptionSelect) {
  planOptionSelect.addEventListener("change", () => {
    transitSelection.plan_id = planOptionSelect.value;
    resetTransitRouteScope();
    loadTransitPicker().catch(() => {
      setTransitPickerSummary("Could not update the selected planning option.");
    }).finally(scheduleAutoPlanRoute);
  });
}

if (corridorSelect) {
  corridorSelect.addEventListener("change", () => {
    const previous = transitSelection.corridor_ids;
    const values = selectedValues(corridorSelect);
    if (values.includes(ALL_ACCESSIBLE_ROUTES) && values.length > 1) {
      transitSelection.corridor_ids = previous.includes(ALL_ACCESSIBLE_ROUTES)
        ? values.filter((value) => value !== ALL_ACCESSIBLE_ROUTES)
        : [ALL_ACCESSIBLE_ROUTES];
    } else {
      transitSelection.corridor_ids = values.length ? values : [ALL_ACCESSIBLE_ROUTES];
    }
    transitSelection.section_id = ALL_SELECTED_ROUTE_SECTIONS;
    transitSelection.stop_id = ALL_STOPS_SELECTED;
    loadTransitPicker().catch(() => {
      setTransitPickerSummary("Could not update the selected route corridors.");
    }).finally(scheduleAutoPlanRoute);
  });
}

if (routeSectionSelect) {
  routeSectionSelect.addEventListener("change", () => {
    const value = routeSectionSelect.value;
    if (value.startsWith("section:")) {
      transitSelection.section_id = value.slice("section:".length);
      transitSelection.stop_id = ALL_STOPS_SELECTED;
    } else if (value.startsWith("stop:")) {
      transitSelection.section_id = ALL_SELECTED_ROUTE_SECTIONS;
      transitSelection.stop_id = value.slice("stop:".length);
    } else {
      transitSelection.section_id = ALL_SELECTED_ROUTE_SECTIONS;
      transitSelection.stop_id = ALL_STOPS_SELECTED;
    }
    loadTransitPicker().catch(() => {
      setTransitPickerSummary("Could not update the selected route section or stop.");
    }).finally(scheduleAutoPlanRoute);
  });
}

if (allStopsSelectedButton) {
  allStopsSelectedButton.addEventListener("click", () => {
    transitSelection.stop_id = ALL_STOPS_SELECTED;
    if (routeSectionSelect) {
      routeSectionSelect.value =
        transitSelection.section_id === ALL_SELECTED_ROUTE_SECTIONS
          ? ALL_SELECTED_ROUTE_SECTIONS
          : `section:${transitSelection.section_id}`;
    }
    loadTransitPicker().catch(() => {
      setTransitPickerSummary("Could not clear the individual stop selection.");
    }).finally(scheduleAutoPlanRoute);
  });
}

if (importTransitButton) {
  importTransitButton.addEventListener("click", importTransitFeed);
}

if (importCtsZipButton) {
  importCtsZipButton.addEventListener("click", importCtsZip);
}

if (planTransitButton) {
  planTransitButton.addEventListener("click", () => {
    planTransitRoute().then(() => openRouteModal());
  });
}

if (routeModal) {
  routeModal.addEventListener("click", (event) => {
    if (event.target && event.target.matches("[data-close-route-modal]")) {
      closeRouteModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRouteModal();
    }
  });
}

async function initializeApp() {
  loadStoredOrigin();
  renderRoutePlan(null);
  ensureRouteMap();
  connectLiveJobEvents();
  await Promise.allSettled([
    loadJobs(),
    loadSourceConfig(),
    loadSourceStatus(),
    importCtsZip(),
    refreshLiveOrigin(),
  ]);
  scheduleAutoPlanRoute();
}

initializeApp();
