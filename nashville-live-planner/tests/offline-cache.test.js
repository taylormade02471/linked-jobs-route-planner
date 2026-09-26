const test = require("node:test");
const assert = require("node:assert/strict");

const offlineCache = require("../offline-cache.js");

test("offline snapshots deduplicate jobs, record UTC freshness, and strip private source fields", () => {
  const snapshot = offlineCache.createSnapshot({
    source: {
      provider_id: "survey_merchandiser",
      mode: "local_provider_bridge",
      source_status: "live",
    },
    retrieved_at_utc_ms: 1_700_000_000_000,
    saved_at_utc_ms: 1_700_000_030_000,
    jobs: [
      {
        id: "survey:job-1",
        provider_id: "survey_merchandiser",
        external_id: "job-1",
        title: "Updated audit",
        address: "100 Main St, Nashville, TN",
        status: "assigned",
        pay_cents: 3850,
        details_url: "https://www.jobslingerplus.com/Info?id=job-1",
        password: "never cache this",
        cookie: "never cache this",
        source_text: "private provider page text",
      },
      {
        id: "survey:job-1",
        provider_id: "survey_merchandiser",
        external_id: "job-1",
        title: "Older duplicate",
        address: "100 Main St, Nashville, TN",
        status: "available",
      },
    ],
  });

  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.jobs[0].title, "Updated audit");
  assert.equal(snapshot.jobs[0].pay_cents, 3850);
  assert.equal(snapshot.jobs[0].details_url, "https://www.jobslingerplus.com/Info?id=job-1");
  assert.equal(snapshot.jobs[0].password, undefined);
  assert.equal(snapshot.jobs[0].cookie, undefined);
  assert.equal(snapshot.jobs[0].source_text, undefined);
  assert.equal(snapshot.retrieved_at_utc_ms, 1_700_000_000_000);
  assert.equal(snapshot.saved_at_utc_ms, 1_700_000_030_000);
  assert.equal(offlineCache.freshnessLabel(snapshot, { online: false }), "cached");
});
