const test = require("node:test");
const assert = require("node:assert/strict");

const { buildExtensionSyncStatus } = require("../../../backend/sourceSync");

test("extension sync status records automated MegaLog transfer without import language", () => {
  const status = buildExtensionSyncStatus({
    syncedJobCount: 8,
    pageUrl: "https://www.jobslingerplus.com/MegaLog",
    nowIso: "2026-08-21T15:00:00.000Z",
  });

  assert.equal(status.state, "live");
  assert.equal(status.message, "Extension synced 8 jobs from MegaLog");
  assert.equal(status.lastScrapeAt, "2026-08-21T15:00:00.000Z");
  assert.equal(status.transferMode, "browser-extension");
  assert.equal(status.pageUrl, "https://www.jobslingerplus.com/MegaLog");
});
