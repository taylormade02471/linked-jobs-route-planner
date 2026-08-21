const test = require("node:test");
const assert = require("node:assert/strict");

const { scoreJobPriority } = require("../../shared/domain/priority");

const nowUtcMs = Date.parse("2026-08-21T14:00:00.000Z");

test("overdue jobs outrank today, tomorrow, and later jobs", () => {
  const overdue = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-20T23:00:00.000Z") }, nowUtcMs);
  const today = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-21T23:00:00.000Z") }, nowUtcMs);
  const tomorrow = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-22T23:00:00.000Z") }, nowUtcMs);
  const later = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-30T23:00:00.000Z") }, nowUtcMs);

  assert.ok(overdue > today);
  assert.ok(today > tomorrow);
  assert.ok(tomorrow > later);
});
