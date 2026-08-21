function cents(value) {
  return Number.isInteger(value) ? value : 0;
}

function calculateJobFinancials(job, expenses = []) {
  const gross_cents = cents(job && job.pay_cents) + cents(job && job.bonus_cents);
  const reimbursable_expenses_cents = expenses
    .filter((expense) => expense && expense.reimbursable)
    .reduce((total, expense) => total + cents(expense.amount_cents), 0);
  const out_of_pocket_cents = expenses
    .filter((expense) => expense && !expense.reimbursable)
    .reduce((total, expense) => total + cents(expense.amount_cents), 0);

  return {
    gross_cents,
    reimbursable_expenses_cents,
    out_of_pocket_cents,
    net_cents: gross_cents - out_of_pocket_cents,
  };
}

module.exports = {
  calculateJobFinancials,
};
