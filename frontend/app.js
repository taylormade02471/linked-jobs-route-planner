const jobsTableBody = document.querySelector("#jobsTableBody");
const jobCount = document.querySelector("#jobCount");
const greenCount = document.querySelector("#greenCount");
const earnCount = document.querySelector("#earnCount");
const selectedCount = document.querySelector("#selectedCount");
const connectionState = document.querySelector("#connectionState");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const buildBestRouteBtn = document.querySelector("#buildBestRoute");
const exportButton = document.querySelector("#exportButton");
const selectAll = document.querySelector("#selectAll");
const logoutForm = document.querySelector("#logoutForm");
const sourceConfigForm = document.querySelector("#sourceConfigForm");
const reloadSourceButton = document.querySelector("#reloadSourceButton");
const sourceStatus = document.querySelector("#sourceStatus");
const credentialsForm = document.querySelector("#credentialsForm");
const credentialsTableBody = document.querySelector("#credentialsTableBody");
const credentialRowTemplate = document.querySelector("#credentialRowTemplate");
const credentialsStatus = document.querySelector("#credentialsStatus");
const clearCredentialButton = document.querySelector("#clearCredentialButton");
const reloadCredentialsButton = document.querySelector("#reloadCredentialsButton");
const template = document.querySelector("#jobRowTemplate");
const startAddressInput = document.querySelector("#startAddress");
const endAddressInput = document.querySelector("#endAddress");
const openMapsBtn = document.querySelector("#openMapsBtn");
const selectGreenBtn = document.querySelector("#selectGreenBtn");
const selectVisibleBtn = document.querySelector("#selectVisibleBtn");
const clearSelectedBtn = document.querySelector("#clearSelectedBtn");
const routeStatusEl = document.querySelector("#routeStatus");
const bestRouteBox = document.querySelector("#bestRouteBox");
const bestRouteList = document.querySelector("#bestRouteList");
const bestRouteMeta = document.querySelector("#bestRouteMeta");

let allJobs = [];
let filteredJobs = [];
let allCredentials = [];
let activeTierFilter = "all";

// ── Tier filter tabs ──────────────────────────────────────────────────────
document.querySelectorAll(".tier-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tier-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTierFilter = btn.dataset.tier || "all";
    render();
  });
});

// ── Transit tier helpers ──────────────────────────────────────────────────
function jobTier(job) { return (job.tier || "red").toLowerCase(); }
function tierLabel(t) { return t === "green" ? "🟢" : t === "yellow" ? "🟡" : "🔴"; }
function tierBadgeClass(t) { return t === "green" ? "badge-green" : t === "yellow" ? "badge-yellow" : "badge-red"; }
function tierRowClass(t) { return t === "green" ? "tier-green" : t === "yellow" ? "tier-yellow" : "tier-red"; }

// ── Best-route algorithm ─────────────────────────────────────────────────
const CORRIDOR_ORDER = ["WeGo Rt 22","WeGo Rt 23","WeGo Rt 14","WeGo Rt 56","WeGo Rt 77","WeGo Rt 52","WeGo Rt 55","WeGo Rt 6"];
function corridorScore(transit) {
  const idx = CORRIDOR_ORDER.findIndex((r) => (transit || "").includes(r.replace("WeGo ", "")));
  return idx === -1 ? 99 : idx;
}
function buildOptimalRoute(jobs) {
  const candidates = jobs
    .filter((j) => jobTier(j) === "green" && j.transit)
    .sort((a, b) => corridorScore(a.transit) - corridorScore(b.transit));
  const grouped = {};
  candidates.forEach((j) => {
    const key = (j.transit || "").split("/")[0].trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(j);
  });
  const ordered = [];
  CORRIDOR_ORDER.forEach((r) => { if (grouped[r]) ordered.push(...grouped[r]); });
  candidates.forEach((j) => { if (!ordered.find((o) => o.id === j.id)) ordered.push(j); });
  return ordered.slice(0, 9);
}
function renderBestRoute(route) {
  if (!bestRouteBox || !route.length) { if (bestRouteBox) bestRouteBox.style.display = "none"; return; }
  bestRouteBox.style.display = "";
  bestRouteList.innerHTML = "";
  route.forEach((job, i) => {
    const li = document.createElement("li");
    li.textContent = `Stop ${i + 1}: ${job.title} — ${job.address} (${job.transit || "walk"}, ${job.distance || ""})`;
    bestRouteList.append(li);
  });
  const earn = (route.length * 8.25).toFixed(2);
  if (bestRouteMeta) bestRouteMeta.textContent = `${route.length} stops · Est. $${earn} · ~5 min/store · WeGo Rt 94 → Nashville`;
}

function render() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  let jobs = allJobs;
  if (activeTierFilter !== "all") jobs = jobs.filter((j) => jobTier(j) === activeTierFilter);
  filteredJobs = jobs.filter((job) => {
    if (!query) return true;
    const hay = [job.title, job.address, job.city, job.state, job.transit, job.pay, job.source].join(" ").toLowerCase();
    return hay.includes(query);
  });

  jobsTableBody.innerHTML = "";
  filteredJobs.forEach((job) => {
    const tier = jobTier(job);
    const row = template.content.firstElementChild.cloneNode(true);
    row.className = tierRowClass(tier);
    const check = row.querySelector(".job-check");
    check.checked = Boolean(job.selected);
    check.addEventListener("change", (e) => { job.selected = e.target.checked; updateCounts(); });

    const tierCell = row.querySelector(".job-tier");
    if (tierCell) {
      const badge = document.createElement("span");
      badge.className = `tier-badge ${tierBadgeClass(tier)}`;
      badge.textContent = tierLabel(tier);
      tierCell.appendChild(badge);
    }
    const titleCell = row.querySelector(".job-title");
    if (titleCell) titleCell.textContent = job.title || "—";
    const addrCell = row.querySelector(".job-address");
    if (addrCell) addrCell.textContent = job.address || "—";
    const payCell = row.querySelector(".job-pay");
    if (payCell) payCell.textContent = job.pay || "$8.25";
    const transitCell = row.querySelector(".job-transit");
    if (transitCell) transitCell.textContent = job.transit || "—";
    const distCell = row.querySelector(".job-distance");
    if (distCell) distCell.textContent = job.distance || "—";
    const statusCell = row.querySelector(".job-status");
    if (statusCell) statusCell.textContent = job.status || "Available";
    jobsTableBody.appendChild(row);
  });

  updateCounts();
}

function updateCounts() {
  const selected = allJobs.filter((j) => j.selected);
  const green = allJobs.filter((j) => jobTier(j) === "green");
  const yellow = allJobs.filter((j) => jobTier(j) === "yellow");
  const red = allJobs.filter((j) => jobTier(j) === "red");

  if (jobCount) jobCount.textContent = String(allJobs.length);
  if (greenCount) greenCount.textContent = String(green.length);
  if (selectedCount) selectedCount.textContent = String(selected.length);
  const earnings = selected.reduce((s) => s + 8.25, 0);
  if (earnCount) earnCount.textContent = `$${earnings.toFixed(2)}`;
  if (selectAll) selectAll.checked = filteredJobs.length > 0 && filteredJobs.every((j) => j.selected);

  // Update tab counts
  ["all","green","yellow","red"].forEach((t) => {
    const el = document.querySelector(`#tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (el) el.textContent = t === "all" ? allJobs.length : (t === "green" ? green.length : t === "yellow" ? yellow.length : red.length);
  });

  // Route status
  const selWithAddr = selected.filter((j) => j.address);
  if (routeStatusEl) routeStatusEl.textContent = selWithAddr.length ? `${selWithAddr.length} stop${selWithAddr.length>1?"s":""} ready for maps.` : "Select jobs to build transit route.";
  if (openMapsBtn) openMapsBtn.disabled = !selWithAddr.length;
}

function setConnection(text) { if (connectionState) connectionState.textContent = text; }
function setSourceStatus(text) { if (sourceStatus) sourceStatus.textContent = text; }
function setCredentialsStatus(text) { if (credentialsStatus) credentialsStatus.textContent = text; }
function getSelectedJobs() { return allJobs.filter((j) => j.selected); }


  setConnection("Loading");
  const response = await fetch("/api/jobs", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allJobs = (payload.jobs || []).map((job) => ({ ...job, selected: Boolean(job.selected) }));
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
  sourceConfigForm.source_url.value = payload.source_url || "";
  sourceConfigForm.source_username.value = payload.source_username || "";
  sourceConfigForm.source_password.value = "";
  setSourceStatus(payload.has_password ? "Saved" : "Needs password");
}

function clearCredentialsForm() {
  if (!credentialsForm) return;
  credentialsForm.id.value = "";
  credentialsForm.app_name.value = "";
  credentialsForm.login_url.value = "";
  credentialsForm.username.value = "";
  credentialsForm.password.value = "";
  credentialsForm.notes.value = "";
}

function fillCredentialsForm(credential) {
  if (!credentialsForm || !credential) return;
  credentialsForm.id.value = credential.id || "";
  credentialsForm.app_name.value = credential.app_name || "";
  credentialsForm.login_url.value = credential.login_url || "";
  credentialsForm.username.value = credential.username || "";
  credentialsForm.password.value = "";
  credentialsForm.notes.value = credential.notes || "";
}

function renderCredentials() {
  if (!credentialsTableBody || !credentialRowTemplate) return;
  credentialsTableBody.innerHTML = "";
  allCredentials.forEach((credential) => {
    const row = credentialRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".cred-app").textContent = credential.app_name || "—";
    row.querySelector(".cred-url").textContent = credential.login_url || "—";
    row.querySelector(".cred-user").textContent = credential.username || "—";
    row.querySelector(".cred-notes").textContent = credential.notes || "—";
    row.querySelector(".cred-status").textContent = credential.has_password ? "Saved locally" : "No password";

    const actions = row.querySelector(".cred-actions");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary tiny";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      fillCredentialsForm(credential);
      setCredentialsStatus(`Editing ${credential.app_name || "credential"}. Password stays local and must be re-entered only if you want to change it.`);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger tiny";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete saved login for ${credential.app_name || "this app"}?`)) {
        return;
      }
      await saveCredential({ action: "delete", id: credential.id });
    });

    actions.append(editButton, deleteButton);
    credentialsTableBody.appendChild(row);
  });
}

async function loadCredentials() {
  if (!credentialsTableBody) return;
  setCredentialsStatus("Loading");
  const response = await fetch("/api/credentials", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allCredentials = payload.credentials || [];
  setCredentialsStatus(allCredentials.length ? `${allCredentials.length} saved login(s)` : "No saved logins");
  renderCredentials();
}

async function saveCredential(extra = {}) {
  if (!credentialsForm) return;
  setCredentialsStatus("Saving");
  const response = await fetch("/api/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      action: extra.action || "upsert",
      id: extra.id || credentialsForm.id.value.trim(),
      app_name: credentialsForm.app_name.value.trim(),
      login_url: credentialsForm.login_url.value.trim(),
      username: credentialsForm.username.value.trim(),
      password: extra.password ?? credentialsForm.password.value,
      notes: credentialsForm.notes.value.trim(),
    }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allCredentials = payload.credentials || allCredentials;
  renderCredentials();
  clearCredentialsForm();
  setCredentialsStatus(allCredentials.length ? `${allCredentials.length} saved login(s)` : "No saved logins");
}

function openMapsRoute() {
  const selected = getSelectedJobs().filter((j) => j.address);
  if (!selected.length) { alert("Select jobs with addresses first."); return; }
  const start = (startAddressInput?.value.trim()) || "Clarksville, TN";
  const end = endAddressInput?.value.trim() || selected[selected.length - 1].address;
  const waypoints = selected.slice(0, -1).map((j) => j.address).filter(Boolean);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", start);
  url.searchParams.set("destination", end);
  if (waypoints.length) url.searchParams.set("waypoints", waypoints.join("|"));
  window.open(url.toString(), "_blank", "noopener");
}

function exportCsv() {
  const rows = [["tier","title","address","pay","transit","distance","status"]];
  getSelectedJobs().forEach((j) => rows.push([j.tier||"",j.title,j.address,j.pay||"$8.25",j.transit||"",j.distance||"",j.status||""]));
  const csv = rows.map((r) => r.map((v) => `"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "survey-merchandiser-jobs.csv";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

refreshButton?.addEventListener("click", (e) => { e.preventDefault(); loadJobs(); });
buildBestRouteBtn?.addEventListener("click", () => {
  const route = buildOptimalRoute(allJobs);
  renderBestRoute(route);
  route.forEach((j) => { j.selected = true; });
  render();
  document.querySelector("#routeSection")?.setAttribute("open", "");
});
openMapsBtn?.addEventListener("click", openMapsRoute);
selectGreenBtn?.addEventListener("click", () => {
  allJobs.filter((j) => jobTier(j) === "green" && j.address).forEach((j) => { j.selected = true; });
  render();
});
selectVisibleBtn?.addEventListener("click", () => {
  filteredJobs.filter((j) => j.address).forEach((j) => { j.selected = true; });
  render();
});
clearSelectedBtn?.addEventListener("click", () => {
  allJobs.forEach((j) => { j.selected = false; });
  if (bestRouteBox) bestRouteBox.style.display = "none";
  render();
});
exportButton?.addEventListener("click", (e) => { e.preventDefault(); exportCsv(); });
searchInput?.addEventListener("input", render);
selectAll?.addEventListener("change", (e) => {
  filteredJobs.forEach((j) => { j.selected = e.target.checked; });
  render();
});
if (logoutForm) logoutForm.addEventListener("submit", () => setConnection("Logged out"));

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
        source_url: sourceConfigForm.source_url.value.trim(),
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

if (credentialsForm) {
  credentialsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCredential();
  });
}

if (clearCredentialButton) {
  clearCredentialButton.addEventListener("click", clearCredentialsForm);
}

if (reloadCredentialsButton) {
  reloadCredentialsButton.addEventListener("click", loadCredentials);
}

loadJobs();
loadSourceConfig();
loadCredentials();
