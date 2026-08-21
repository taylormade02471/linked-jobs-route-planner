const test = require("node:test");
const assert = require("node:assert/strict");

const { reconcileStatus } = require("../../shared/domain/reconcile");

test("paid provider status moves job to completed", () => {
  assert.equal(reconcileStatus({ status: "awaiting_payment" }, { status: "paid" }), "completed");
});

test("local awaiting payment is preserved when incoming source is only active", () => {
  assert.equal(reconcileStatus({ status: "awaiting_payment" }, { status: "active" }), "awaiting_payment");
});
