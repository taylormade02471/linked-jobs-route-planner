const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("planner registers an offline shell and exposes cached-data status controls", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /navigator\.serviceWorker\.register\(['"]\.\/service-worker\.js/);
  assert.match(html, /id=["']offlineStatus["']/);
  assert.match(html, /id=["']saveOfflineSnapshot["']/);
  assert.ok(fs.existsSync(path.join(root, "service-worker.js")));
});

test("offline shell upgrades stale job data automatically while retaining an offline fallback", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.match(serviceWorker, /nashville-planner-shell-v4/);
  assert.match(serviceWorker, /async function networkFirst/);
  assert.match(serviceWorker, /caches\.match\(request,\{ignoreSearch:true\}\)/);
  assert.match(serviceWorker, /request\.mode==='navigate'/);
  assert.match(html, /navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.match(html, /planner-data\.js\?v=20260926-four-active/);
  assert.match(html, /route-planner-core\.js\?v=20260925-furthest-first/);
  assert.match(html, /work-app-backbone\.js\?v=20260926-safe-sync/);
  assert.match(serviceWorker, /planner-data\.js\?v=20260926-four-active/);
  assert.match(serviceWorker, /route-planner-core\.js\?v=20260925-furthest-first/);
  assert.match(serviceWorker, /work-app-backbone\.js\?v=20260926-safe-sync/);
});

test("planner map does not depend on the broken watermarked CARTO tile endpoint", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /basemaps\.cartocdn\.com\/light_all/);
  assert.match(html, /tile\.openstreetmap\.org/);
});
