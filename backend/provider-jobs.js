const crypto = require("crypto");

const SECRET_FIELD_PATTERN = /(password|passcode|token|secret|cookie|session|authorization|bearer|api[_-]?key|csrf|source_text)/i;
const ROUTE_VISIBLE_STATUSES = new Set(["available", "assigned", "needs_completion"]);
const SAFE_JOB_STATUSES = new Set([...ROUTE_VISIBLE_STATUSES, "completed"]);

const SAFE_FIELDS = [
  "id",
  "provider_id",
  "provider_label",
  "connector_id",
  "external_id",
  "title",
  "location_name",
  "address",
  "city",
  "state",
  "postcode",
  "lat",
  "lon",
  "lng",
  "distance_miles",
  "pay_cents",
  "due",
  "accepted_at",
  "minutes",
  "duration_text",
  "timer_minutes",
  "photos_required",
  "purchase_required",
  "requirements",
  "ready_state",
  "status",
  "payment_status",
  "source",
  "source_video",
  "submitted_at",
  "review_note",
  "order",
  "imported_at",
  "updated_at",
];

function asText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value) {
  const text = asText(value).toLowerCase();
  if (
    text.includes("needs completion") ||
    text.includes("need to complete") ||
    text.includes("needs to complete") ||
    text.includes("overdue") ||
    text.includes("due soon") ||
    text.includes("late") ||
    text.includes("in progress")
  ) return "needs_completion";
  if (
    text.includes("submitted") ||
    text.includes("applied") ||
    text.includes("requested") ||
    text.includes("apply required") ||
    text.includes("application required") ||
    text.includes("requires application") ||
    text.includes("must apply")
  ) return "applied";
  if (text.includes("paid") || text.includes("completed") || text === "complete" || text.includes("done")) return "completed";
  if (text.includes("claimed") || text.includes("reserved") || text.includes("planned") || text.includes("accepted") || text.includes("assigned")) return "assigned";
  if (text.includes("available") || text.includes("open") || text.includes("claim now")) return "available";
  return text || "available";
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || asText(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function safeJobId(job) {
  if (job.id) return asText(job.id).slice(0, 180);
  if (job.provider_id && job.external_id) return `${job.provider_id}:${job.external_id}`.slice(0, 180);
  const raw = [
    job.provider_id,
    job.title,
    job.address,
    job.pay_cents,
  ].map(asText).join(":");
  return crypto.createHash("sha1").update(raw).digest("hex");
}

function normalizeProviderId(value) {
  const id = asText(value).toLowerCase();
  return id || "unknown_provider";
}

function sanitizeIncomingJob(job, index = 0) {
  if (!job || typeof job !== "object") return null;
  const status = normalizeStatus(job.status);
  if (!SAFE_JOB_STATUSES.has(status)) return null;

  const base = {
    provider_id: normalizeProviderId(job.provider_id || job.provider),
    provider_label: asText(job.provider_label),
    connector_id: asText(job.connector_id),
    external_id: asText(job.external_id),
    title: asText(job.title || job.name || "Provider job"),
    location_name: asText(job.location_name),
    address: asText(job.address || job.location),
    city: asText(job.city),
    state: asText(job.state),
    postcode: asText(job.postcode || job.zip),
    lat: normalizeNumber(job.lat ?? job.latitude),
    lon: normalizeNumber(job.lon ?? job.lng ?? job.longitude),
    lng: normalizeNumber(job.lng ?? job.lon ?? job.longitude),
    distance_miles: normalizeNumber(job.distance_miles),
    pay_cents: Math.max(0, Math.round(Number(job.pay_cents || 0))),
    due: asText(job.due || job.deadline || job.window),
    accepted_at: asText(job.accepted_at),
    minutes: normalizePositiveInteger(job.minutes),
    duration_text: asText(job.duration_text),
    timer_minutes: normalizePositiveInteger(job.timer_minutes),
    photos_required: job.photos_required == null ? null : Math.max(0, Math.round(Number(job.photos_required || 0))),
    purchase_required: job.purchase_required == null ? null : Boolean(job.purchase_required),
    requirements: asText(job.requirements),
    ready_state: asText(job.ready_state),
    status,
    payment_status: asText(job.payment_status),
    source: asText(job.source || "android-safe-provider-sync"),
    source_video: asText(job.source_video),
    submitted_at: asText(job.submitted_at),
    review_note: asText(job.review_note),
    order: Number.isFinite(Number(job.order)) ? Number(job.order) : index + 1,
    imported_at: Number(job.imported_at) || 0,
    updated_at: Number(job.updated_at) || Date.now(),
  };

  base.id = safeJobId({ ...base, id: job.id });

  const safe = {};
  SAFE_FIELDS.forEach((field) => {
    if (SECRET_FIELD_PATTERN.test(field)) return;
    const value = base[field];
    if (value !== undefined && value !== null && value !== "") safe[field] = value;
  });

  Object.keys(job).forEach((key) => {
    if (SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
  });

  return safe;
}

function isRouteVisibleStatus(status) {
  return ROUTE_VISIBLE_STATUSES.has(normalizeStatus(status));
}

function normalizeIncomingProviderJobs(jobs) {
  return (Array.isArray(jobs) ? jobs : [])
    .map(sanitizeIncomingJob)
    .filter(Boolean);
}

function upsertProviderJobs(existingJobs = [], incomingJobs = []) {
  const byId = new Map((Array.isArray(existingJobs) ? existingJobs : []).map((job) => [job.id, job]));
  normalizeIncomingProviderJobs(incomingJobs).forEach((job) => {
    byId.set(job.id, { ...byId.get(job.id), ...job });
  });
  return Array.from(byId.values());
}

function filterProviderJobs(jobs = [], filters = {}) {
  const provider = asText(filters.provider || filters.provider_id || "all").toLowerCase();
  const status = asText(filters.status || "all").toLowerCase();
  const normalizedStatus = status === "all" || status === "" ? "all" : normalizeStatus(status);
  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => provider === "all" || provider === "" || job.provider_id === provider)
    .filter((job) => {
      if (status === "route_visible") return isRouteVisibleStatus(job.status);
      return normalizedStatus === "all" || normalizeStatus(job.status) === normalizedStatus;
    });
}

module.exports = {
  filterProviderJobs,
  isRouteVisibleStatus,
  normalizeIncomingProviderJobs,
  normalizeStatus,
  upsertProviderJobs,
};
