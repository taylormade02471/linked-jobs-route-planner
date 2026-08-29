const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");

test("desktop server module does not start live browser polling on import", async () => {
  const serverSource = await fs.readFile("backend/server.js", "utf8");
  assert.equal(serverSource.includes("startLivePolling();"), false);
});

test("desktop entrypoint remains server_live.js", async () => {
  const pkg = JSON.parse(await fs.readFile("backend/package.json", "utf8"));
  assert.equal(pkg.main, "server_live.js");
});

test("desktop server is local-only by default with explicit host override", async () => {
  const serverSource = await fs.readFile("backend/server.js", "utf8");
  assert.match(serverSource, /HOST\s*=\s*process\.env\.HOST\s*\|\|\s*"127\.0\.0\.1"/);
  assert.doesNotMatch(serverSource, /server\.listen\(PORT,\s*"0\.0\.0\.0"/);
});

test("automatic route planning defaults to open available jobs", async () => {
  const serverSource = await fs.readFile("backend/server.js", "utf8");
  const appSource = await fs.readFile("frontend/app.js", "utf8");
  assert.match(serverSource, /jobs\.filter\(isOpenAvailableJob\)/);
  assert.match(appSource, /allJobs\.filter\(isOpenAvailableJob\)/);
});

test("route planning includes pay value in recommendation scoring", async () => {
  const transitSource = await fs.readFile("backend/transitland.js", "utf8");
  assert.match(transitSource, /normalizeMoneyToCents/);
  assert.match(transitSource, /moneyBoost/);
  assert.match(transitSource, /estimated_pay_cents/);
});
