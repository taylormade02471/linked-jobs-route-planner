function normalizePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function makeJobFingerprint(job) {
  const providerId = normalizePart(job && job.provider_id);
  const sourceJobId = String((job && job.source_job_id) || "").trim();
  if (providerId && sourceJobId) return `provider:${providerId}:${sourceJobId}`;

  const title = normalizePart(job && job.title);
  const address = normalizePart(job && (job.address1 || job.address));
  const due = Number.isFinite(job && job.due_at_utc_ms) ? String(job.due_at_utc_ms) : "";
  return `fallback:${title}:${address}:${due}`;
}

function findDuplicateJob(existingJobs, incomingJob) {
  const incomingFingerprint = makeJobFingerprint(incomingJob);
  return (existingJobs || []).find((job) => makeJobFingerprint(job) === incomingFingerprint) || null;
}

module.exports = {
  findDuplicateJob,
  makeJobFingerprint,
};
