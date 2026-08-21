const MONEY_FIELD_NAMES = new Set([
  "pay_cents",
  "bonus_cents",
  "expenses_cap_cents",
  "special_expenses_cap_cents",
]);

function normalizeMoneyToCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  const text = String(value).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) return 0;
  return Math.round(Number(match[0]) * 100);
}

function normalizeUtcMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function validateJob(job) {
  if (!job || typeof job !== "object") {
    throw new Error("job must be an object");
  }
  if (!job.id) throw new Error("job.id is required");
  if (!job.title) throw new Error("job.title is required");

  for (const field of ["pay", "bonus", "expenses", "special_expenses"]) {
    if (Object.prototype.hasOwnProperty.call(job, field)) {
      throw new Error(`Use integer cents field instead of ${field}; expected ${field}_cents or expenses_cap_cents`);
    }
  }

  for (const [key, value] of Object.entries(job)) {
    if (key.endsWith("_cents") && !MONEY_FIELD_NAMES.has(key)) continue;
    if (MONEY_FIELD_NAMES.has(key) && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${key} must be a non-negative integer cent value`);
    }
  }

  return true;
}

module.exports = {
  normalizeMoneyToCents,
  normalizeUtcMs,
  validateJob,
};
