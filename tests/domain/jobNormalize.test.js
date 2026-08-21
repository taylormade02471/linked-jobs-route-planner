const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeMegaLogJob } = require("../../shared/domain/jobNormalize");

test("MegaLog job normalizes money, status, details, and source fields", () => {
  const job = normalizeMegaLogJob(
    {
      id: "summary-7120213",
      title: "Electronics ...",
      client: "Ipsos Insight L...",
      address: "2805 WILMA RUDOLPH BLVD CLARKSVILLE, TN 37040",
      due: "Submit due:08/18",
      pay: "Shop Pay: 16.00",
      status: "active",
      info_url: "https://www.jobslingerplus.com/Info",
      source_url: "https://www.jobslingerplus.com/MegaLog",
    },
    { nowUtcMs: Date.parse("2026-08-21T14:00:00.000Z") }
  );

  assert.equal(job.id, "summary-7120213");
  assert.equal(job.provider_id, "jobslinger");
  assert.equal(job.pay_cents, 1600);
  assert.equal(job.status, "active");
  assert.equal(job.details_url, "https://www.jobslingerplus.com/Info");
  assert.equal(job.source_url, "https://www.jobslingerplus.com/MegaLog");
  assert.equal(job.updated_at_utc_ms, Date.parse("2026-08-21T14:00:00.000Z"));
});
