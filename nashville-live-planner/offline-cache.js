const SNAPSHOT_SCHEMA_VERSION = 1;

const SAFE_JOB_FIELDS = [
  "id",
  "provider_id",
  "provider_label",
  "external_id",
  "title",
  "location_name",
  "address",
  "city",
  "state",
  "postal_code",
  "pay_cents",
  "bonus_cents",
  "expense_limit_cents",
  "pay_unit",
  "due",
  "due_at_utc_ms",
  "window_start_utc_ms",
  "window_end_utc_ms",
  "minutes",
  "duration_text",
  "status",
  "claim_state",
  "payment_status",
  "source",
  "source_status",
  "source_url",
  "provider_url",
  "details_url",
  "lat",
  "lon",
  "distance_miles",
  "requirements",
  "photos_required",
  "purchase_required",
  "ready_state",
  "timer_minutes",
  "review_note",
  "recommendation_score",
  "recommendation_reason",
  "transit_access",
  "transit_stop",
  "transit_service_date",
  "transit_verified_at_utc_ms",
  "confidence",
  "updated_at",
  "imported_at",
  "completed_at",
];

const SAFE_SOURCE_FIELDS = [
  "provider_id",
  "provider_label",
  "mode",
  "source_status",
  "source_url",
  "account_label",
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function sanitizeCoordinate(value) {
  if (!value || typeof value !== "object") return undefined;
  const lat = finiteNumber(value.lat);
  const lon = finiteNumber(value.lon ?? value.lng);
  if (lat === undefined || lon === undefined) return undefined;
  return {
    lat,
    lon,
    source: text(value.source, 100),
  };
}

function sanitizeJob(job = {}) {
  if (!job || typeof job !== "object") return null;
  const safe = {};
  SAFE_JOB_FIELDS.forEach((field) => {
    if (job[field] === undefined || job[field] === null || job[field] === "") return;
    if (field.endsWith("_cents") || field.endsWith("_utc_ms") || field === "minutes" || field === "timer_minutes" || field === "photos_required" || field === "recommendation_score") {
      const number = finiteNumber(job[field]);
      if (number !== undefined) safe[field] = number;
      return;
    }
    if (field === "lat" || field === "lon" || field === "distance_miles") {
      const number = finiteNumber(job[field]);
      if (number !== undefined) safe[field] = number;
      return;
    }
    if (field === "purchase_required") {
      safe[field] = Boolean(job[field]);
      return;
    }
    if (field === "transit_access" && typeof job[field] === "object") {
      safe[field] = {
        color: text(job[field].color, 20),
        walking_miles: finiteNumber(job[field].walking_miles),
        nearest_stop: text(job[field].nearest_stop, 200),
        service_date: text(job[field].service_date, 40),
        verified_at_utc_ms: finiteNumber(job[field].verified_at_utc_ms),
      };
      return;
    }
    const value = text(job[field]);
    if (value !== undefined) safe[field] = value;
  });
  const coordinate = sanitizeCoordinate(job.coordinate);
  if (coordinate) safe.coordinate = coordinate;
  return safe;
}

function stableJobKey(job) {
  if (job?.id) return String(job.id);
  if (job?.provider_id && job?.external_id) return `${job.provider_id}:${job.external_id}`;
  return [job?.provider_id, job?.title, job?.address, job?.due_at_utc_ms || job?.due]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return (Array.isArray(jobs) ? jobs : [])
    .map(sanitizeJob)
    .filter(Boolean)
    .filter((job) => {
      const key = stableJobKey(job);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sanitizeSource(source = {}) {
  const safe = {};
  SAFE_SOURCE_FIELDS.forEach((field) => {
    const value = text(source[field], 300);
    if (value !== undefined) safe[field] = value;
  });
  return safe;
}

function createSnapshot({ source = {}, jobs = [], retrieved_at_utc_ms, saved_at_utc_ms } = {}) {
  const retrieved = finiteNumber(retrieved_at_utc_ms) ?? Date.now();
  const saved = finiteNumber(saved_at_utc_ms) ?? Date.now();
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    privacy: "local_device_snapshot",
    source: sanitizeSource(source),
    retrieved_at_utc_ms: retrieved,
    saved_at_utc_ms: saved,
    jobs: dedupeJobs(jobs),
  };
}

function freshnessLabel(snapshot, { online = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.jobs)) return "offline no data";
  return online && snapshot.source?.mode === "official_live" ? "live" : "cached";
}

function saveSnapshot(storage, snapshot) {
  if (!storage || typeof storage.setItem !== "function") return false;
  storage.setItem("nashville_route_planner_offline_snapshot_v1", JSON.stringify(snapshot));
  return true;
}

function loadSnapshot(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const parsed = JSON.parse(storage.getItem("nashville_route_planner_offline_snapshot_v1") || "null");
    return parsed?.schema_version === SNAPSHOT_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

const api = {
  SNAPSHOT_SCHEMA_VERSION,
  createSnapshot,
  freshnessLabel,
  loadSnapshot,
  saveSnapshot,
  sanitizeJob,
  sanitizeSource,
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else if (typeof self !== "undefined") {
  self.OfflineCache = api;
}
