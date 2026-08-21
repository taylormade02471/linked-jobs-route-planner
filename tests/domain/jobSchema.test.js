const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeMoneyToCents,
  normalizeUtcMs,
  validateJob,
} = require("../../shared/domain/jobSchema");

test("money is normalized to integer cents", () => {
  assert.equal(normalizeMoneyToCents("16.00"), 1600);
  assert.equal(normalizeMoneyToCents("$120"), 12000);
  assert.equal(normalizeMoneyToCents("Expenses: up to 4.50"), 450);
  assert.equal(normalizeMoneyToCents(null), 0);
});

test("timestamps normalize to UTC epoch milliseconds", () => {
  assert.equal(normalizeUtcMs("2026-08-21T12:00:00.000Z"), 1787313600000);
});

test("job validation rejects non-cent money field names", () => {
  assert.throws(() => validateJob({ id: "1", title: "A", pay: 16 }), /pay_cents/);
});
