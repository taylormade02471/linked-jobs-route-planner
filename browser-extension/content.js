'use strict';

const endpoint = 'http://127.0.0.1:3300/api/jobs';
const panelId = 'megalog-local-sync-status';
let syncTimer;

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

function scoreTable(parsed) {
  const labels = parsed.headers.join(' ').toLowerCase();
  const likelyFields = ['shop', 'company', 'date', 'due', 'status', 'pay', 'location', 'city', 'address']
    .filter((field) => labels.includes(field)).length;
  return (parsed.records.length * 4) + (likelyFields * 25) + parsed.headers.length;
}

function findBestTable() {
  return Array.from(document.querySelectorAll('table'))
    .map(rowsFromTable)
    .filter(Boolean)
    .sort((left, right) => scoreTable(right) - scoreTable(left))[0] || null;
}

function showStatus(message, isError = false) {
  let panel = document.querySelector(`#${panelId}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:14px',
      'z-index:2147483647',
      'max-width:330px',
      'padding:12px 14px',
      'border:1px solid #1e6452',
      'border-radius:8px',
      'background:#f8fff8',
      'color:#14362e',
      'box-shadow:0 12px 30px rgba(0,0,0,.22)',
      'font:13px/1.4 Arial,sans-serif'
    ].join(';');
    document.body.append(panel);
  }

  panel.textContent = message;
  panel.style.borderColor = isError ? '#b42318' : '#1e6452';
  panel.style.background = isError ? '#fff7f5' : '#f8fff8';
}

async function syncNow(reason = 'auto') {
  const parsed = findBestTable();
  if (!parsed) {
    showStatus('Linked Jobs sync: no usable job table found yet.', true);
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

  if (!response.ok) throw new Error(`local app returned ${response.status}`);
  const saved = await response.json();
  showStatus(`Linked Jobs sync: ${saved.count} rows saved at ${new Date().toLocaleTimeString()}.`);
}

function scheduleSync(reason) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow(reason).catch((error) => {
      showStatus(`Linked Jobs sync failed: ${error.message}`, true);
    });
  }, 1200);
}

scheduleSync('page-loaded');

new MutationObserver(() => scheduleSync('page-updated'))
  .observe(document.body, { childList: true, subtree: true, characterData: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleSync('tab-visible');
});
