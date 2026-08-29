(function () {
  const D = window.PLANNER_DATA || {};
  const Core = window.RoutePlannerCore;
  const STORAGE_KEY = "nashville_phone_work_jobs_v1";
  const map = L.map("map").setView([36.16, -86.78], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const lineLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const jobLayer = L.layerGroup().addTo(map);
  const liveLayer = L.layerGroup().addTo(map);
  const planSel = document.getElementById("plan");
  const startMode = document.getElementById("startMode");
  const routeSel = document.getElementById("route");
  const sectionSel = document.getElementById("section");
  const viewSel = document.getElementById("view");
  const storage = loadStorage();
  let live = { vehicles: [], alerts: [], ok: false };
  let currentLocation = storage.location || null;
  let locationWatchId = null;
  let activeTab = storage.activeTab || "available";

  function loadStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...storage,
      selectedStopIds: Core.normalizeStopIds(storage.selectedStopIds || []),
      location: currentLocation,
      activeTab,
      plan: planSel.value,
      startMode: startMode.value,
      route: routeSel.value,
      section: sectionSel.value,
      view: viewSel.value,
    }));
  }

  function findJobLeg(jobId) {
    for (const [sectionKey, section] of Object.entries(D.sections || {})) {
      for (const leg of section.legs || []) {
        if (leg.job === jobId || leg.extra_job === jobId) return { ...leg, section: sectionKey };
      }
    }
    return null;
  }

  function jobRecords() {
    const records = Object.entries(D.jobs || {}).map(([id, job]) => ({ id, ...job }));
    records.forEach((job) => {
      const match = findJobLeg(job.id);
      job.lat = Number.isFinite(Number(job.lat)) ? Number(job.lat) : match?.alight_stop?.lat ?? null;
      job.lng = Number.isFinite(Number(job.lng)) ? Number(job.lng) : match?.alight_stop?.lon ?? null;
      job.route = match?.route || "";
      job.section = match?.section || "";
      job.stopName = match?.alight_stop?.name || "Verified stop unavailable";
      job.status = storage.statuses?.[job.id] || "available";
    });
    return records;
  }

  function selectedJobs() {
    const records = jobRecords();
    const ids = Core.normalizeStopIds(storage.selectedStopIds || []);
    return ids.map((id) => records.find((job) => job.id === id)).filter(Boolean);
  }

  function selectedPlanJobIds() {
    if (planSel.value === "Custom route" || planSel.value === "Automatic best route") return Core.normalizeStopIds(storage.selectedStopIds || []);
    return Core.collectPlanJobIds(D, planSel.value);
  }

  function activePlanJobIds() {
    if (storage.manualOverrides && planSel.value !== "Custom route" && planSel.value !== "Automatic best route") return Core.normalizeStopIds(storage.selectedStopIds || []);
    return Core.normalizeStopIds(selectedPlanJobIds());
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function populatePlans() {
    Object.keys(D.plans || {}).forEach((name) => addOption(planSel, name, name));
    addOption(planSel, "Custom route", "Custom route");
    addOption(planSel, "Automatic best route", "Automatic best route");
    const savedPlan = storage.plan && Array.from(planSel.options).some((option) => option.value === storage.plan);
    planSel.value = savedPlan ? storage.plan : Object.keys(D.plans || {})[0];
  }

  function populateRoutes() {
    routeSel.innerHTML = "";
    addOption(routeSel, "", "No route overlay");
    Core.collectVerifiedRoutes(D).forEach((route) => addOption(routeSel, route.shortName, `Route ${route.shortName} - ${route.corridors.join(" / ")}`));
    if (storage.route && Array.from(routeSel.options).some((option) => option.value === storage.route)) routeSel.value = storage.route;
  }

  function routeSections() {
    if (!routeSel.value) return [];
    const sections = [];
    Object.entries(D.sections || {}).forEach(([key, section]) => {
      if ((section.legs || []).some((leg) => String(leg.route) === routeSel.value && leg.board_stop && leg.alight_stop)) sections.push([key, section]);
    });
    return sections;
  }

  function populateSections() {
    sectionSel.innerHTML = "";
    addOption(sectionSel, "all", "All selected route sections");
    routeSections().forEach(([key, section]) => addOption(sectionSel, key, section.title));
    if (storage.section && Array.from(sectionSel.options).some((option) => option.value === storage.section)) sectionSel.value = storage.section;
    populateViews();
  }

  function populateViews() {
    viewSel.innerHTML = "";
    addOption(viewSel, "all", "All selected route sections");
    routeSections().filter(([key]) => sectionSel.value === "all" || key === sectionSel.value).forEach(([key, section]) => {
      addOption(viewSel, `section:${key}`, section.title);
      (section.legs || []).filter((leg) => String(leg.route) === routeSel.value).forEach((leg) => addOption(viewSel, `leg:${key}:${section.legs.indexOf(leg)}`, `${leg.board_stop.name} -> ${leg.alight_stop.name}`));
    });
    if (storage.view && Array.from(viewSel.options).some((option) => option.value === storage.view)) viewSel.value = storage.view;
  }

  function selectedLegs() {
    if (!routeSel.value) return [];
    const legs = [];
    routeSections().forEach(([sectionKey, section]) => {
      if (sectionSel.value !== "all" && sectionSel.value !== sectionKey) return;
      (section.legs || []).forEach((leg, index) => {
        if (String(leg.route) !== routeSel.value) return;
        if (viewSel.value.startsWith("section:") && viewSel.value !== `section:${sectionKey}`) return;
        if (viewSel.value.startsWith("leg:") && viewSel.value !== `leg:${sectionKey}:${index}`) return;
        legs.push({ ...leg, _section: sectionKey, _sectionTitle: section.title, _legIndex: index });
      });
    });
    return legs;
  }

  function originPoint() {
    if (startMode.value === "live" && currentLocation) return currentLocation;
    return selectedJobs()[0] || null;
  }

  function renderJobsOnMap() {
    jobLayer.clearLayers();
    const records = jobRecords().filter((job) => activePlanJobIds().includes(job.id) && job.status !== "hidden" && Number.isFinite(job.lat) && Number.isFinite(job.lng));
    records.forEach((job, index) => {
      const marker = L.marker([job.lat, job.lng], { icon: L.divIcon({ className: "job-icon", html: `<span class="job-pin">${index + 1}</span>`, iconSize: [25, 25], iconAnchor: [12, 12] }) });
      marker.bindPopup(`<b>${escapeHtml(job.name)}</b><br>${escapeHtml(job.address)}<br><span style="color:#148447">Available locally</span><br>Source: Survey Merchandiser import`);
      marker.addTo(jobLayer);
    });
    if (currentLocation) L.marker([currentLocation.lat, currentLocation.lng], { icon: L.divIcon({ className: "location-icon", html: '<span class="location-pin"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).bindPopup("Your last shared location").addTo(jobLayer);
  }

  function renderMap() {
    lineLayer.clearLayers();
    stopLayer.clearLayers();
    liveLayer.clearLayers();
    const bounds = [];
    const legs = selectedLegs();
    if (routeSel.value) {
      legs.forEach((leg) => {
        const color = D.routeColors?.[leg.route] || "#0f5f68";
        if (Array.isArray(leg.segment) && leg.segment.length > 1) L.polyline(leg.segment, { color, weight: 6, opacity: .82 }).addTo(lineLayer);
        [leg.board_stop, leg.alight_stop].forEach((stop, index) => {
          const point = [stop.lat, stop.lon];
          bounds.push(point);
          L.marker(point).bindPopup(`<b>${index === 0 ? "BOARDING STOP" : "EXIT STOP"}</b><br>${escapeHtml(stop.name)}<br>Route ${escapeHtml(leg.route)}<br>Source: Scheduled estimate`).addTo(stopLayer);
        });
        (leg.segment || []).forEach((point) => bounds.push(point));
      });
    }
    renderJobsOnMap();
    if (!routeSel.value) selectedJobs().filter((job) => Number.isFinite(job.lat) && Number.isFinite(job.lng)).forEach((job) => bounds.push([job.lat, job.lng]));
    if (bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: routeSel.value ? 14 : 13 });
    renderDetails(legs);
    renderLiveLayers(legs);
    updateGuidance(legs);
    document.getElementById("mapSummary").textContent = routeSel.value ? `${legs.length} verified ${routeSel.value} route section leg(s) shown.` : `${selectedJobs().length} job stop(s) selected. Transit stops appear after a route is chosen.`;
  }

  function renderDetails(legs) {
    const target = document.getElementById("details");
    if (!routeSel.value) { target.innerHTML = '<p class="muted">Choose a verified route overlay to show boarding and exit stops.</p>'; return; }
    if (!legs.length) { target.innerHTML = '<p class="muted">No verified section or path in this plan uses that route.</p>'; return; }
    target.innerHTML = legs.map((leg) => {
      const isChange = (leg.label || "").toLowerCase().includes("change");
      const job = D.jobs?.[leg.job] || D.jobs?.[leg.extra_job];
      const direction = routeDirection(leg);
      const walkTime = String(leg.static || "").match(/(?:allow\s*~?|walk\s*~?)(\d+)\s*min/i)?.[1];
      const jobTime = job?.minutes ? `${job.minutes} min` : "Job time unavailable";
      return `<div class="detail-leg ${isChange ? "change" : ""}"><strong>Route ${escapeHtml(leg.route)} - ${escapeHtml(direction)} - ${escapeHtml(leg.label || leg._sectionTitle)}</strong><div class="detail-grid"><span><b>Board:</b> ${escapeHtml(leg.board_stop.name)} (${escapeHtml(leg.board || "stop ID unavailable")})</span><span><b>Exit:</b> ${escapeHtml(leg.alight_stop.name)} (${escapeHtml(leg.alight || "stop ID unavailable")})</span><span><b>Scheduled pickup:</b> ${escapeHtml(leg.static || "Scheduled time unavailable")}</span><span><b>Walk to job:</b> ${walkTime ? `${walkTime} min` : "Walk time unavailable"}</span><span><b>Job work time:</b> ${escapeHtml(jobTime)}</span><span><b>Nearest job/address:</b> ${escapeHtml(leg.destination || job?.address || "Job location unavailable")}</span><span><b>Source:</b> Scheduled estimate</span><span><b>Buffer:</b> ${isChange ? "Connection risk: verify live" : "Review live arrival before boarding"}</span></div></div>`;
    }).join("");
  }

  function routeDirection(leg) {
    const text = `${leg.label || ""} ${leg.board_stop?.name || ""} ${leg.alight_stop?.name || ""}`.toLowerCase();
    const match = text.match(/\b(northbound|southbound|eastbound|westbound|inbound|outbound)\b/);
    return match ? match[1] : "Direction not identified in verified data";
  }

  function renderBoard() {
    const records = jobRecords().filter((job) => activeTab === "all" ? job.status !== "hidden" : job.status === activeTab);
    const board = document.getElementById("jobCarousel");
    board.innerHTML = "";
    document.getElementById("boardSummary").textContent = `${jobRecords().filter((job) => job.status === "available").length} available locally; ${selectedJobs().length} route stops selected.`;
    document.getElementById("stopCount").textContent = `${selectedJobs().length} / ${Core.MAX_STOPS} stops`;
    if (!records.length) { board.innerHTML = '<p class="muted">No jobs in this board view. Open All saved or add a local import.</p>'; return; }
    const template = document.getElementById("jobCardTemplate");
    records.forEach((job) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".job-status").textContent = job.status === "completed" ? "Completed / history" : job.status === "planned" ? "Planned" : "Available / open";
      card.querySelector(".job-title").textContent = job.name || "Job";
      card.querySelector(".job-address").textContent = job.address || "Address unavailable";
      card.querySelector(".job-meta").textContent = [job.route ? `Verified Route ${job.route}` : "Transit link unverified", job.stopName, job.pay ? `$${Number(job.pay).toFixed(2)}` : job.pay_requested ? `$${Number(job.pay_requested).toFixed(2)} requested` : "Pay unavailable"].join(" | ");
      const addButton = card.querySelector(".add-stop-button");
      const selected = (storage.selectedStopIds || []).includes(job.id);
      addButton.textContent = selected ? "Remove from route" : "Add to route";
      addButton.addEventListener("click", () => toggleStop(job.id));
      const statusSelect = card.querySelector(".job-status-select");
      statusSelect.value = job.status === "hidden" ? "available" : job.status;
      statusSelect.addEventListener("change", () => updateJobStatus(job.id, statusSelect.value));
      board.appendChild(card);
    });
  }

  function toggleStop(id) {
    const ids = Core.normalizeStopIds(storage.selectedStopIds || []);
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    if (next.length > Core.MAX_STOPS) return alert(`A route can contain up to ${Core.MAX_STOPS} stops.`);
    storage.selectedStopIds = next;
    if (planSel.value !== "Custom route" && planSel.value !== "Automatic best route") storage.manualOverrides = true;
    saveStorage();
    renderBoard();
    renderMap();
  }

  function updateJobStatus(id, status) {
    storage.statuses = { ...(storage.statuses || {}), [id]: status };
    saveStorage();
    renderBoard();
    renderMap();
  }

  function automaticallyOrder() {
    const records = selectedJobs();
    if (!records.length) return alert("Add jobs to the route first.");
    storage.selectedStopIds = Core.orderStopsByFeasibility(records, originPoint()).map((job) => job.id);
    planSel.value = "Automatic best route";
    saveStorage();
    renderBoard();
    renderMap();
  }

  function updateGuidance(legs) {
    const title = document.getElementById("guidanceTitle");
    const text = document.getElementById("guidanceText");
    const target = routeSel.value && legs[0] && startMode.value === "live" && currentLocation ? legs[0].board_stop : selectedJobs()[0];
    if (!target) { title.textContent = "Select live location to begin"; text.textContent = "Turn guidance will use your location and the next selected job or verified boarding stop."; return; }
    const guidance = Core.buildGuidance(originPoint(), { ...target, name: target.name || target.address });
    title.textContent = guidance.targetName;
    text.textContent = `${guidance.instruction} This is a location-based estimate; verify the road path and live arrival before moving.`;
  }

  function useLiveLocation() {
    if (!navigator.geolocation) return alert("This browser does not provide location access.");
    document.getElementById("locationState").textContent = "Requesting location...";
    if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = navigator.geolocation.watchPosition((position) => {
      currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude, updatedAt: Date.now() };
      document.getElementById("locationState").textContent = "Live location active";
      saveStorage();
      renderMap();
    }, (error) => {
      document.getElementById("locationState").textContent = "Location unavailable";
      alert(`Location access was not available: ${error.message}`);
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 });
  }

  function openGoogleRoute() {
    const jobs = selectedJobs().filter((job) => job.address);
    if (!jobs.length) return alert("Add at least one job with an address first.");
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    if (currentLocation && startMode.value === "live") url.searchParams.set("origin", `${currentLocation.lat},${currentLocation.lng}`);
    else url.searchParams.set("origin", jobs[0].address);
    url.searchParams.set("destination", jobs.at(-1).address);
    if (jobs.length > 2) url.searchParams.set("waypoints", jobs.slice(1, -1).map((job) => job.address).join("|"));
    window.open(url.toString(), "_blank", "noopener");
  }

  function readVarint(bytes, state) { let value = 0, shift = 0; while (state.i < bytes.length) { const byte = bytes[state.i++]; value += (byte & 127) * 2 ** shift; if (!(byte & 128)) return value; shift += 7; } return value; }
  function fields(bytes) { const state = { i: 0 }, output = []; while (state.i < bytes.length) { const key = readVarint(bytes, state), number = Math.floor(key / 8), wire = key & 7; let value; if (wire === 0) value = readVarint(bytes, state); else if (wire === 1) { value = bytes.slice(state.i, state.i + 8); state.i += 8; } else if (wire === 2) { const length = readVarint(bytes, state); value = bytes.slice(state.i, state.i + length); state.i += length; } else if (wire === 5) { value = bytes.slice(state.i, state.i + 4); state.i += 4; } else break; output.push([number, wire, value]); } return output; }
  const textDecoder = new TextDecoder();
  const decode = (value) => { try { return textDecoder.decode(value); } catch { return ""; } };
  const float32 = (value) => new DataView(value.buffer, value.byteOffset, 4).getFloat32(0, true);
  function tripDescription(bytes) { const value = {}; fields(bytes).forEach(([n, w, v]) => { if (n === 1 && w === 2) value.trip_id = decode(v); if (n === 5 && w === 2) value.route_id = decode(v); }); return value; }
  function vehicleDescription(bytes) { const value = {}; fields(bytes).forEach(([n, w, v]) => { if (n === 1 && w === 2) value.id = decode(v); if (n === 2 && w === 2) value.label = decode(v); }); return value; }
  function position(bytes) { const value = {}; fields(bytes).forEach(([n, w, v]) => { if (n === 1 && w === 5) value.lat = float32(v); if (n === 2 && w === 5) value.lon = float32(v); }); return value; }
  function parseVehicle(bytes) { const value = {}; fields(bytes).forEach(([n, w, v]) => { if (n === 1 && w === 2) value.trip = tripDescription(v); if (n === 2 && w === 2) value.position = position(v); if (n === 5 && w === 0) value.timestamp = v; if (n === 7 && w === 2) value.stop_id = decode(v); if (n === 8 && w === 2) value.vehicle = vehicleDescription(v); }); return value; }
  function translated(bytes) { for (const [n, w, v] of fields(bytes)) if (n === 1 && w === 2) for (const [en, ew, ev] of fields(v)) if (en === 1 && ew === 2) return decode(ev); return ""; }
  function alertRecord(bytes) { const value = { routes: [] }; fields(bytes).forEach(([n, w, v]) => { if (n === 5 && w === 2) fields(v).forEach(([sn, sw, sv]) => { if (sn === 2 && sw === 2) value.routes.push(decode(sv)); }); if (n === 10 && w === 2) value.header = translated(v); if (n === 11 && w === 2) value.description = translated(v); }); return value; }
  function parseFeed(base64, kind) { if (!base64) return []; const raw = atob(base64); const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0)); const output = []; fields(bytes).forEach(([n, w, v]) => { if (n !== 2 || w !== 2) return; fields(v).forEach(([en, ew, ev]) => { if (kind === "vehicle" && en === 4 && ew === 2) output.push(parseVehicle(ev)); if (kind === "alert" && en === 5 && ew === 2) output.push(alertRecord(ev)); }); }); return output; }

  async function refreshLive() {
    const status = document.getElementById("liveStatus");
    status.textContent = "Refreshing official WeGo realtime feeds...";
    try {
      const response = await fetch(`/api/wego-live?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      live = { vehicles: parseFeed(payload.vehiclePositions, "vehicle"), alerts: parseFeed(payload.alerts, "alert"), ok: true };
      status.textContent = `Live verified: ${live.vehicles.length} vehicles / ${live.alerts.length} alerts; refreshed ${new Date(payload.fetchedAt).toLocaleTimeString()}.`;
    } catch (error) {
      live = { vehicles: [], alerts: [], ok: false };
      status.textContent = `Live feed unavailable (${error.message}). Scheduled estimate remains available.`;
    }
    renderLiveLayers(selectedLegs());
    renderDetails(selectedLegs());
  }

  function renderLiveLayers(legs) {
    liveLayer.clearLayers();
    const buses = document.getElementById("buses");
    const alerts = document.getElementById("alerts");
    if (!routeSel.value) { buses.innerHTML = '<p class="muted">Select a verified route overlay to show buses.</p>'; alerts.innerHTML = '<p class="muted">Select a verified route overlay to show alerts.</p>'; return; }
    const routes = new Set(legs.map((leg) => String(leg.route)));
    const busesForRoute = live.vehicles.filter((vehicle) => routes.has(String(D.routeIdToShort?.[vehicle.trip?.route_id] || vehicle.trip?.route_id)) && vehicle.position?.lat != null);
    busesForRoute.forEach((vehicle) => L.circleMarker([vehicle.position.lat, vehicle.position.lon], { radius: 8, color: "#0f3d45", weight: 2, fillColor: "#f7c948", fillOpacity: .95 }).bindPopup(`<b>Live verified bus</b><br>Route ${escapeHtml(D.routeIdToShort?.[vehicle.trip?.route_id] || vehicle.trip?.route_id || "unknown")}<br>${escapeHtml(vehicle.vehicle?.label || vehicle.vehicle?.id || "Vehicle")}`).addTo(liveLayer));
    buses.innerHTML = busesForRoute.length ? busesForRoute.map((vehicle) => `<div class="feed-row"><strong>Route ${escapeHtml(D.routeIdToShort?.[vehicle.trip?.route_id] || vehicle.trip?.route_id || "unknown")} - Live verified</strong><span>${escapeHtml(vehicle.vehicle?.label || vehicle.vehicle?.id || "Vehicle")} ${vehicle.stop_id ? `near stop ${escapeHtml(vehicle.stop_id)}` : ""}</span></div>`).join("") : `<p class="muted">${live.ok ? "No current vehicle is explicitly assigned to the selected route." : "Live backend unavailable; no stale bus position is substituted."}</p>`;
    const routeAlerts = live.alerts.filter((alert) => (alert.routes || []).some((route) => routes.has(String(D.routeIdToShort?.[route] || route))));
    alerts.innerHTML = routeAlerts.length ? routeAlerts.map((alert) => `<div class="feed-row"><strong>${escapeHtml(alert.header || "WeGo alert")}</strong><span>${escapeHtml(alert.description || "Live alert details unavailable")}</span></div>`).join("") : `<p class="muted">${live.ok ? "No current realtime alert targets the selected route." : "Live alert backend unavailable."}</p>`;
  }

  function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }

  document.getElementById("locateButton").addEventListener("click", useLiveLocation);
  document.getElementById("automaticButton").addEventListener("click", automaticallyOrder);
  document.getElementById("googleRouteButton").addEventListener("click", openGoogleRoute);
  document.getElementById("refreshButton").addEventListener("click", refreshLive);
  [planSel, startMode, routeSel, sectionSel, viewSel].forEach((select) => select.addEventListener("change", () => {
    if (select === planSel && planSel.value !== "Custom route" && planSel.value !== "Automatic best route") {
      storage.manualOverrides = false;
      storage.selectedStopIds = Core.normalizeStopIds(Core.collectPlanJobIds(D, planSel.value));
    }
    if (select === routeSel) populateSections();
    if (select === sectionSel) populateViews();
    saveStorage();
    renderBoard();
    renderMap();
  }));
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { activeTab = tab.dataset.tab; document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab)); saveStorage(); renderBoard(); }));

  populatePlans();
  populateRoutes();
  if (!storage.selectedStopIds) storage.selectedStopIds = Core.collectPlanJobIds(D, planSel.value);
  if (storage.startMode && ["live", "first"].includes(storage.startMode)) startMode.value = storage.startMode;
  populateSections();
  renderBoard();
  renderMap();
  refreshLive();
  setInterval(refreshLive, 30000);
})();
