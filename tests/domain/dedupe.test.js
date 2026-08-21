const test = require("node:test");
const assert = require("node:assert/strict");

const { makeJobFingerprint, findDuplicateJob } = require("../../shared/domain/dedupe");

test("job fingerprint prefers provider and source job id", () => {
  assert.equal(
    makeJobFingerprint({ provider_id: "jobslinger", source_job_id: "ABC123", address1: "2805 Wilma" }),
    "provider:jobslinger:ABC123"
  );
});

test("duplicate detection falls back to normalized address and title", () => {
  const existing = [{ id: "1", title: "Electronics", address1: "2805 WILMA RUDOLPH BLVD", due_at_utc_ms: 10 }];
  const incoming = { id: "2", title: " electronics ", address1: "2805 wilma rudolph blvd", due_at_utc_ms: 10 };
  assert.equal(findDuplicateJob(existing, incoming).id, "1");
});
