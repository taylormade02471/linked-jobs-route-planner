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

test("planner map does not depend on the broken watermarked CARTO tile endpoint", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /basemaps\.cartocdn\.com\/light_all/);
  assert.match(html, /tile\.openstreetmap\.org/);
});
