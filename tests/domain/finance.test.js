const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateJobFinancials } = require("../../shared/domain/finance");

test("financial totals use cents", () => {
  const result = calculateJobFinancials(
    { pay_cents: 1600, bonus_cents: 200 },
    [{ amount_cents: 500, reimbursable: true }, { amount_cents: 250, reimbursable: false }]
  );

  assert.equal(result.gross_cents, 1800);
  assert.equal(result.reimbursable_expenses_cents, 500);
  assert.equal(result.out_of_pocket_cents, 250);
  assert.equal(result.net_cents, 1550);
});
