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
const jobRowTemplate = document.querySelector("#jobRowTemplate");
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
const linkedBoardsForm = document.querySelector("#linkedBoardsForm");
const linkedBoardsList = document.querySelector("#linkedBoardsList");
const linkedBoardsStatus = document.querySelector("#linkedBoardsStatus");
const reloadLinkedBoardsButton = document.querySelector("#reloadLinkedBoardsButton");
const parseSharedJobsButton = document.querySelector("#parseSharedJobsButton");
const sharedJobsInput = document.querySelector("#sharedJobsInput");
const sharedJobsSource = document.querySelector("#sharedJobsSource");
const shareStatus = document.querySelector("#shareStatus");

let allJobs = [];
let filteredJobs = [];
let allLinkedBoards = [];
let activeTierFilter = "all";

document.querySelectorAll(".tier-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tier-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTierFilter = btn.dataset.tier || "all";
    render();
  });
});

function jobTier(job) {
  return (job.tier || "red").toLowerCase();
}

function tierLabel(tier) {
  return tier === "green" ? "🟢" : tier === "yellow" ? "🟡" : "🔴";
}

function tierBadgeClass(tier) {
  return tier === "green" ? "badge-green" : tier === "yellow" ? "badge-yellow" : "badge-red";
}

function tierRowClass(tier) {
  return tier === "green" ? "tier-green" : tier === "yellow" ? "tier-yellow" : "tier-red";
}

const CORRIDOR_ORDER = ["WeGo Rt 22", "WeGo Rt 23", "WeGo Rt 14", "WeGo Rt 56", "WeGo Rt 77", "WeGo Rt 52", "WeGo Rt 55", "WeGo Rt 6"];

function corridorScore(transit) {
  const index = CORRIDOR_ORDER.findIndex((route) => (transit || "").includes(route.replace("WeGo ", "")));
  return index === -1 ? 99 : index;
}

function buildOptimalRoute(jobs) {
  const candidates = jobs
    .filter((job) => jobTier(job) === "green" && job.transit)
    .sort((a, b) => corridorScore(a.transit) - corridorScore(b.transit));
  const grouped = {};
  candidates.forEach((job) => {
    const key = (job.transit || "").split("/")[0].trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(job);
  });
  const ordered = [];
  CORRIDOR_ORDER.forEach((route) => {
    if (grouped[route]) ordered.push(...grouped[route]);
  });
  candidates.forEach((job) => {
    if (!ordered.find((existing) => existing.id === job.id)) ordered.push(job);
  });
  return ordered.slice(0, 9);
}

function renderBestRoute(route) {
  if (!bestRouteBox || !route.length) {
    if (bestRouteBox) bestRouteBox.style.display = "none";
    return;
  }
  bestRouteBox.style.display = "";
  bestRouteList.innerHTML = "";
  route.forEach((job, index) => {
    const li = document.createElement("li");
    li.textContent = `Stop ${index + 1}: ${job.title} — ${job.address} (${job.transit || "walk"}, ${job.distance || ""})`;
    bestRouteList.append(li);
  });
  const earn = (route.length * 8.25).toFixed(2);
  if (bestRouteMeta) bestRouteMeta.textContent = `${route.length} stops · Est. $${earn} · ~5 min/store · WeGo Rt 94 → Nashville`;
}

function setConnection(text) {
  if (connectionState) connectionState.textContent = text;
}

function setLinkedBoardsStatus(text) {
  if (linkedBoardsStatus) linkedBoardsStatus.textContent = text;
}

function setShareStatus(text) {
  if (shareStatus) shareStatus.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSelectedJobs() {
  return allJobs.filter((job) => job.selected);
}

function render() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  let jobs = allJobs;
  if (activeTierFilter !== "all") jobs = jobs.filter((job) => jobTier(job) === activeTierFilter);
  filteredJobs = jobs.filter((job) => {
    if (!query) return true;
    const haystack = [job.title, job.address, job.city, job.state, job.transit, job.pay, job.source, job.status]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  jobsTableBody.innerHTML = "";
  filteredJobs.forEach((job) => {
    const tier = jobTier(job);
    const row = jobRowTemplate.content.firstElementChild.cloneNode(true);
    row.className = tierRowClass(tier);
    const check = row.querySelector(".job-check");
    check.checked = Boolean(job.selected);
    check.addEventListener("change", (event) => {
      job.selected = event.target.checked;
      updateCounts();
    });

    const tierCell = row.querySelector(".job-tier");
    const badge = document.createElement("span");
    badge.className = `tier-badge ${tierBadgeClass(tier)}`;
    badge.textContent = tierLabel(tier);
    tierCell.appendChild(badge);

    row.querySelector(".job-title").textContent = job.title || "—";
    row.querySelector(".job-address").textContent = job.address || "—";
    row.querySelector(".job-pay").textContent = job.pay || "$8.25";
    row.querySelector(".job-transit").textContent = job.transit || "—";
    row.querySelector(".job-distance").textContent = job.distance || "—";
    row.querySelector(".job-source").textContent = job.source || "—";
    row.querySelector(".job-status").textContent = job.status || "Available";
    jobsTableBody.appendChild(row);
  });

  updateCounts();
}

function updateCounts() {
  const selected = allJobs.filter((job) => job.selected);
  const green = allJobs.filter((job) => jobTier(job) === "green");
  const yellow = allJobs.filter((job) => jobTier(job) === "yellow");
  const red = allJobs.filter((job) => jobTier(job) === "red");

  if (jobCount) jobCount.textContent = String(allJobs.length);
  if (greenCount) greenCount.textContent = String(green.length);
  if (selectedCount) selectedCount.textContent = String(selected.length);
  if (earnCount) earnCount.textContent = `$${selected.reduce((sum) => sum + 8.25, 0).toFixed(2)}`;
  if (selectAll) selectAll.checked = filteredJobs.length > 0 && filteredJobs.every((job) => job.selected);

  ["all", "green", "yellow", "red"].forEach((tier) => {
    const el = document.querySelector(`#tab${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
    if (!el) return;
    el.textContent = String(
      tier === "all" ? allJobs.length : tier === "green" ? green.length : tier === "yellow" ? yellow.length : red.length
    );
  });

  const withAddress = selected.filter((job) => job.address);
  if (routeStatusEl) {
    routeStatusEl.textContent = withAddress.length
      ? `${withAddress.length} stop${withAddress.length > 1 ? "s" : ""} ready for maps.`
      : "Select jobs to build transit route.";
  }
  if (openMapsBtn) openMapsBtn.disabled = !withAddress.length;
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
  setConnection("Ready");
  render();
}

function boardCard(board) {
  return `
    <article class="board-card">
      <div class="board-card-head">
        <div>
          <h3>${escapeHtml(board.label)}</h3>
          <p>${escapeHtml(board.description)}</p>
        </div>
        <label class="board-toggle">
          <input type="checkbox" data-field="enabled" ${board.enabled ? "checked" : ""} />
          Link board
        </label>
      </div>
      <input type="hidden" data-field="id" value="${escapeHtml(board.id)}" />
      <input type="hidden" data-field="has_password" value="${board.has_password ? "true" : "false"}" />
      <div class="board-card-grid">
        <label>Login URL<input data-field="login_url" value="${escapeHtml(board.login_url || "")}" placeholder="https://example.com/login" /></label>
        <label>Username / email<input data-field="username" value="${escapeHtml(board.username || "")}" autocomplete="username" /></label>
        <label>Password<input data-field="password" type="password" autocomplete="current-password" placeholder="${board.has_password ? "Saved locally" : "Enter only if you want it stored locally"}" /></label>
        <label>Notes<input data-field="notes" value="${escapeHtml(board.notes || "")}" placeholder="Optional login or board note" /></label>
      </div>
      <div class="board-meta">
        <span class="pill small">Sync: ${escapeHtml(board.sync_mode.replaceAll("_", " "))}</span>
        <a href="${escapeHtml(board.board_url)}" target="_blank" rel="noreferrer noopener">Open board</a>
      </div>
      <label class="inline">
        <input type="checkbox" data-field="clear_password" />
        Clear saved password for this board
      </label>
      <p class="helper board-helper">${escapeHtml(board.connection_help)}</p>
    </article>
  `;
}

function renderLinkedBoards() {
  if (!linkedBoardsList) return;
  linkedBoardsList.innerHTML = allLinkedBoards.map(boardCard).join("");
  const enabledCount = allLinkedBoards.filter((board) => board.enabled).length;
  setLinkedBoardsStatus(enabledCount ? `${enabledCount} linked` : "None linked");
}

async function loadLinkedBoards() {
  if (!linkedBoardsList) return;
  setLinkedBoardsStatus("Loading");
  const response = await fetch("/api/linked-boards", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allLinkedBoards = payload.boards || [];
  renderLinkedBoards();
}

function serializeLinkedBoards() {
  return Array.from(linkedBoardsList.querySelectorAll(".board-card")).map((card) => ({
    id: card.querySelector('[data-field="id"]').value,
    enabled: card.querySelector('[data-field="enabled"]').checked,
    login_url: card.querySelector('[data-field="login_url"]').value.trim(),
    username: card.querySelector('[data-field="username"]').value.trim(),
    password: card.querySelector('[data-field="password"]').value,
    notes: card.querySelector('[data-field="notes"]').value.trim(),
    clear_password:
      card.querySelector('[data-field="has_password"]').value === "true" &&
      card.querySelector('[data-field="clear_password"]').checked,
  }));
}

async function saveLinkedBoards() {
  setLinkedBoardsStatus("Saving");
  const response = await fetch("/api/linked-boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ boards: serializeLinkedBoards() }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allLinkedBoards = payload.boards || [];
  renderLinkedBoards();
}

async function importSharedJobs() {
  const text = sharedJobsInput?.value.trim() || "";
  if (!text) {
    setShareStatus("Paste one or more job rows first.");
    return;
  }
  setShareStatus("Parsing");
  const response = await fetch("/api/shared-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      source: sharedJobsSource?.value.trim() || "Shared intake",
      text,
    }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  if (!response.ok) {
    setShareStatus(payload.error || "Could not import shared jobs.");
    return;
  }
  sharedJobsInput.value = "";
  setShareStatus(`Imported ${payload.imported} job row(s).`);
  await loadJobs();
}

function openMapsRoute() {
  const selected = getSelectedJobs().filter((job) => job.address);
  if (!selected.length) {
    alert("Select jobs with addresses first.");
    return;
  }
  const start = startAddressInput?.value.trim() || "Clarksville, TN";
  const end = endAddressInput?.value.trim() || selected[selected.length - 1].address;
  const waypoints = selected.slice(0, -1).map((job) => job.address).filter(Boolean);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", start);
  url.searchParams.set("destination", end);
  if (waypoints.length) url.searchParams.set("waypoints", waypoints.join("|"));
  window.open(url.toString(), "_blank", "noopener");
}

function exportCsv() {
  const rows = [["tier", "title", "address", "pay", "transit", "distance", "source", "status"]];
  getSelectedJobs().forEach((job) => {
    rows.push([job.tier || "", job.title, job.address, job.pay || "$8.25", job.transit || "", job.distance || "", job.source || "", job.status || ""]);
  });
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "linked-job-boards.csv";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

refreshButton?.addEventListener("click", (event) => {
  event.preventDefault();
  loadJobs();
});

buildBestRouteBtn?.addEventListener("click", () => {
  const route = buildOptimalRoute(allJobs);
  renderBestRoute(route);
  route.forEach((job) => {
    job.selected = true;
  });
  render();
  document.querySelector("#routeSection")?.setAttribute("open", "");
});

openMapsBtn?.addEventListener("click", openMapsRoute);
selectGreenBtn?.addEventListener("click", () => {
  allJobs.filter((job) => jobTier(job) === "green" && job.address).forEach((job) => {
    job.selected = true;
  });
  render();
});
selectVisibleBtn?.addEventListener("click", () => {
  filteredJobs.filter((job) => job.address).forEach((job) => {
    job.selected = true;
  });
  render();
});
clearSelectedBtn?.addEventListener("click", () => {
  allJobs.forEach((job) => {
    job.selected = false;
  });
  if (bestRouteBox) bestRouteBox.style.display = "none";
  render();
});
exportButton?.addEventListener("click", (event) => {
  event.preventDefault();
  exportCsv();
});
searchInput?.addEventListener("input", render);
selectAll?.addEventListener("change", (event) => {
  filteredJobs.forEach((job) => {
    job.selected = event.target.checked;
  });
  render();
});
if (logoutForm) logoutForm.addEventListener("submit", () => setConnection("Logged out"));
if (linkedBoardsForm) linkedBoardsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveLinkedBoards();
});
reloadLinkedBoardsButton?.addEventListener("click", loadLinkedBoards);
parseSharedJobsButton?.addEventListener("click", importSharedJobs);

loadJobs();
loadLinkedBoards();
