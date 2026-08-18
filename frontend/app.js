'use strict';

const jobCount = document.querySelector('#jobCount');
const selectedCount = document.querySelector('#selectedCount');
const lastSync = document.querySelector('#lastSync');
const sourceUrl = document.querySelector('#sourceUrl');
const jobsTableBody = document.querySelector('#jobsTable tbody');
const refreshJobs = document.querySelector('#refreshJobs');
const downloadCsv = document.querySelector('#downloadCsv');
const startAddress = document.querySelector('#startAddress');
const endAddress = document.querySelector('#endAddress');
const jobFilter = document.querySelector('#jobFilter');
const selectVisible = document.querySelector('#selectVisible');
const clearSelected = document.querySelector('#clearSelected');
const openMaps = document.querySelector('#openMaps');
const routeStatus = document.querySelector('#routeStatus');
const syncSnippet = document.querySelector('#syncSnippet');
const copySnippet = document.querySelector('#copySnippet');
const copyStatus = document.querySelector('#copyStatus');

let latestJobs = [];
let selectedJobIds = new Set(JSON.parse(localStorage.getItem('selectedJobIds') || '[]'));

function syncMegaLogToLocalhost() {
  const endpoint = 'http://127.0.0.1:3300/api/jobs';
  const panelId = 'megalog-local-sync-panel';
  let observer;
  let timer;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function uniqueHeaders(values) {
    const counts = new Map();
    return values.map((value, index) => {
      const base = cleanText(value) || `Column ${index + 1}`;
      const count = (counts.get(base) || 0) + 1;
      counts.set(base, count);
      return count === 1 ? base : `${base} (${count})`;
    });
  }

  function rowsFromTable(table) {
    const rows = Array.from(table.rows)
      .map((row) => ({
        isHeader: row.querySelectorAll('th').length > 0,
        cells: Array.from(row.cells).map((cell) => cleanText(cell.textContent))
      }))
      .filter((row) => row.cells.some(Boolean));

    if (rows.length < 2) return null;

    const headerIndex = Math.max(0, rows.findIndex((row) => row.isHeader));
    const headers = uniqueHeaders(rows[headerIndex].cells);
    const records = rows
      .slice(headerIndex + 1)
      .filter((row) => row.cells.some(Boolean))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row.cells[index] || ''])));

    return records.length ? { headers, records } : null;
  }

  function tableScore(parsed) {
    const labels = parsed.headers.join(' ').toLowerCase();
    const likelyFields = ['shop', 'company', 'date', 'due', 'status', 'pay', 'location', 'city', 'address']
      .filter((field) => labels.includes(field)).length;
    return (parsed.records.length * 4) + (likelyFields * 25) + parsed.headers.length;
  }

  function findBestTable() {
    return Array.from(document.querySelectorAll('table'))
      .map(rowsFromTable)
      .filter(Boolean)
      .sort((left, right) => tableScore(right) - tableScore(left))[0] || null;
  }

  function renderPanel(message, isError = false) {
    let panel = document.querySelector(`#${panelId}`);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:14px 16px;border:1px solid #1e6452;border-radius:8px;background:#f8fff8;color:#14362e;box-shadow:0 12px 30px rgba(0,0,0,.22);font:14px/1.4 Arial,sans-serif';
      document.body.append(panel);
    }
    panel.textContent = message;
    panel.style.borderColor = isError ? '#b42318' : '#1e6452';
    panel.style.background = isError ? '#fff7f5' : '#f8fff8';
  }

  async function sendNow(reason = 'manual') {
    const parsed = findBestTable();
    if (!parsed) {
      renderPanel('Linked Jobs sync: no usable job table found on this page.', true);
      return;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: location.href,
        captured_at: new Date().toISOString(),
        reason,
        jobs: parsed.records
      })
    });

    if (!response.ok) throw new Error(`Local app returned ${response.status}`);
    const saved = await response.json();
    renderPanel(`Linked Jobs sync: ${saved.count} rows saved to localhost at ${new Date().toLocaleTimeString()}.`);
  }

  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      sendNow('page-update').catch((error) => renderPanel(`Linked Jobs sync failed: ${error.message}`, true));
    }, 1200);
  }

  sendNow('started').catch((error) => renderPanel(`Linked Jobs sync failed: ${error.message}`, true));
  observer?.disconnect();
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  renderPanel('Linked Jobs sync is watching this tab for job updates.');
}

function makeBookmarklet() {
  return `javascript:(${syncMegaLogToLocalhost.toString()})()`;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function normalized(value) {
  return String(value || '').toLowerCase();
}

function jobLocation(job) {
  const fields = job.fields || {};
  return job.location || fields.Address || fields.Location || fields.City || fields.Market || '';
}

function visibleJobs() {
  const needle = normalized(jobFilter.value);
  if (!needle) return latestJobs;
  return latestJobs.filter((job) => normalized([
    job.title,
    jobLocation(job),
    job.pay,
    job.due,
    job.status,
    Object.values(job.fields || {}).join(' ')
  ].join(' ')).includes(needle));
}

function saveSelected() {
  localStorage.setItem('selectedJobIds', JSON.stringify([...selectedJobIds]));
  selectedCount.textContent = String(selectedJobIds.size);
}

function renderJobs(payload) {
  latestJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const validIds = new Set(latestJobs.map((job) => job.id));
  selectedJobIds = new Set([...selectedJobIds].filter((id) => validIds.has(id)));

  jobCount.textContent = String(latestJobs.length);
  lastSync.textContent = formatDate(payload.updated_at);
  sourceUrl.textContent = payload.source || 'No linked account page has synced yet.';
  renderVisibleRows();
  saveSelected();
}

function renderVisibleRows() {
  jobsTableBody.replaceChildren();
  const jobs = visibleJobs();

  if (!jobs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = latestJobs.length ? 'No jobs match the current filter.' : 'No linked account jobs have synced yet.';
    row.append(cell);
    jobsTableBody.append(row);
    updateRouteStatus();
    return;
  }

  jobs.forEach((job) => {
    const row = document.createElement('tr');
    const useCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedJobIds.has(job.id);
    checkbox.setAttribute('aria-label', `Use ${job.title || job.id} in route`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedJobIds.add(job.id);
      else selectedJobIds.delete(job.id);
      saveSelected();
      updateRouteStatus();
    });
    useCell.append(checkbox);
    row.append(useCell);

    [job.title, jobLocation(job), job.pay, job.due, job.status].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value || '');
      row.append(cell);
    });

    jobsTableBody.append(row);
  });

  updateRouteStatus();
}

async function loadJobs() {
  const response = await fetch('/api/jobs');
  if (!response.ok) throw new Error(`Unable to load jobs: ${response.status}`);
  renderJobs(await response.json());
}

function selectedJobsWithLocations() {
  return latestJobs.filter((job) => selectedJobIds.has(job.id) && jobLocation(job));
}

function updateRouteStatus() {
  const stops = selectedJobsWithLocations();
  const tooMany = stops.length > 9;
  openMaps.disabled = !stops.length || tooMany;
  routeStatus.textContent = !stops.length
    ? 'Select jobs with locations to create a maps route.'
    : tooMany
      ? 'Google Maps links work best with 9 or fewer selected job stops.'
      : `${stops.length} job stop${stops.length === 1 ? '' : 's'} ready for maps.`;
}

function openMapsRoute() {
  const stops = selectedJobsWithLocations();
  if (!stops.length || stops.length > 9) return;

  const start = startAddress.value.trim() || 'Current Location';
  const end = endAddress.value.trim();
  const destination = end || jobLocation(stops[stops.length - 1]);
  const waypoints = end ? stops.map(jobLocation) : stops.slice(0, -1).map(jobLocation);
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', start);
  url.searchParams.set('destination', destination);
  if (waypoints.length) url.searchParams.set('waypoints', waypoints.join('|'));
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadJobsCsv() {
  if (!latestJobs.length) return;
  const headers = ['title', 'location', 'pay', 'due', 'status'];
  const lines = [
    headers.map(csvCell).join(','),
    ...latestJobs.map((job) => headers.map((header) => csvCell(header === 'location' ? jobLocation(job) : job[header])).join(','))
  ];
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = 'linked-jobs-route-feed.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

syncSnippet.value = makeBookmarklet();
startAddress.value = localStorage.getItem('startAddress') || '';
endAddress.value = localStorage.getItem('endAddress') || '';

copySnippet.addEventListener('click', async () => {
  await navigator.clipboard.writeText(syncSnippet.value);
  copyStatus.textContent = 'Manual sync snippet copied.';
});

refreshJobs.addEventListener('click', () => {
  loadJobs().catch((error) => {
    sourceUrl.textContent = error.message;
  });
});

downloadCsv.addEventListener('click', downloadJobsCsv);
jobFilter.addEventListener('input', renderVisibleRows);
startAddress.addEventListener('input', () => localStorage.setItem('startAddress', startAddress.value));
endAddress.addEventListener('input', () => localStorage.setItem('endAddress', endAddress.value));
selectVisible.addEventListener('click', () => {
  visibleJobs().forEach((job) => {
    if (jobLocation(job)) selectedJobIds.add(job.id);
  });
  saveSelected();
  renderVisibleRows();
});
clearSelected.addEventListener('click', () => {
  selectedJobIds.clear();
  saveSelected();
  renderVisibleRows();
});
openMaps.addEventListener('click', openMapsRoute);

loadJobs().catch((error) => {
  sourceUrl.textContent = error.message;
});
