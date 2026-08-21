const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(utcMs) {
  const date = new Date(utcMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function scoreJobPriority(job, nowUtcMs = Date.now()) {
  const dueUtcMs = Number.isFinite(job && job.due_at_utc_ms) ? job.due_at_utc_ms : null;
  if (!dueUtcMs) return 100;

  const nowDay = startOfUtcDay(nowUtcMs);
  const dueDay = startOfUtcDay(dueUtcMs);
  const daysUntilDue = Math.round((dueDay - nowDay) / DAY_MS);

  if (daysUntilDue < 0) return 1000 + Math.min(Math.abs(daysUntilDue), 30);
  if (daysUntilDue === 0) return 900;
  if (daysUntilDue === 1) return 800;
  if (daysUntilDue <= 3) return 650 - daysUntilDue;
  if (daysUntilDue <= 7) return 500 - daysUntilDue;
  return Math.max(100, 300 - daysUntilDue);
}

module.exports = {
  scoreJobPriority,
};
