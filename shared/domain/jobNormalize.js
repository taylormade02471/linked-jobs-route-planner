const { normalizeMoneyToCents, normalizeUtcMs } = require("./jobSchema");

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(raw) {
  const text = compact(raw).toLowerCase();
  if (text.includes("paid")) return "completed";
  if (text.includes("complete") || text.includes("done")) return "completed";
  if (text.includes("submitted") || text.includes("awaiting")) return "awaiting_payment";
  if (text.includes("planned")) return "planned";
  return text || "active";
}

function normalizeMegaLogJob(raw, options = {}) {
  const nowUtcMs = normalizeUtcMs(options.nowUtcMs) || Date.now();
  const id = compact(raw.id || raw.source_job_id || raw.title);
  const detailsUrl = compact(raw.details_url || raw.info_url || raw.url);

  return {
    id,
    provider_id: "jobslinger",
    source_job_id: compact(raw.source_job_id || raw.id),
    title: compact(raw.title || "Untitled job"),
    client: compact(raw.client),
    survey: compact(raw.survey || (raw.detail_fields && raw.detail_fields.survey)),
    address1: compact(raw.address || raw.address1 || (raw.detail_fields && raw.detail_fields.address)),
    city: compact(raw.city),
    state: compact(raw.state),
    zip: compact(raw.zip || raw.postcode),
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lng: Number.isFinite(raw.lng) ? raw.lng : null,
    due_at_utc_ms: normalizeUtcMs(raw.due_at_utc_ms || raw.due_at || raw.due),
    submit_due_at_utc_ms: normalizeUtcMs(raw.submit_due_at_utc_ms || raw.submit_due_at),
    do_not_shop_before_utc_ms: normalizeUtcMs(raw.do_not_shop_before_utc_ms || raw.do_not_shop_before),
    status: normalizeStatus(raw.workflow_status || raw.status),
    pay_cents: normalizeMoneyToCents(raw.pay_cents ?? raw.pay),
    bonus_cents: normalizeMoneyToCents(raw.bonus_cents ?? raw.bonus),
    expenses_cap_cents: normalizeMoneyToCents(raw.expenses_cap_cents ?? raw.expenses ?? raw.expenses_up_to),
    special_expenses_cap_cents: normalizeMoneyToCents(
      raw.special_expenses_cap_cents ?? raw.special_expenses ?? raw.special_expenses_up_to
    ),
    details_url: detailsUrl,
    source_url: compact(raw.source_url),
    raw_source_id: compact(raw.raw_source_id || raw.source),
    notes: compact(raw.notes || raw.details),
    created_at_utc_ms: normalizeUtcMs(raw.created_at_utc_ms || raw.created_at) || nowUtcMs,
    updated_at_utc_ms: normalizeUtcMs(raw.updated_at_utc_ms || raw.updated_at) || nowUtcMs,
  };
}

module.exports = {
  normalizeMegaLogJob,
  normalizeStatus,
};
