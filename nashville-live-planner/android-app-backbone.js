/* android-app-backbone.js — safe Android share/import bridge */
(function registerAndroidAppBackbone(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AndroidAppBackbone = api;
})(typeof window !== 'undefined' ? window : globalThis, function androidAppBackboneFactory() {
  const SECRET_PATTERN = /(password|passcode|token|secret|cookie|session|authorization|bearer|api[_-]?key|csrf)/i;

  function normalizeSharePayload(text) {
    if (!text || typeof text !== 'string') return { ok: false, reason: 'empty' };
    if (SECRET_PATTERN.test(text)) return { ok: false, reason: 'contains_secret_field' };
    return { ok: true, text: text.trim().substring(0, 4000) };
  }

  function createImportReviewItems(rawText) {
    const norm = normalizeSharePayload(rawText);
    if (!norm.ok) return [];
    const lines = norm.text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    return lines.map((line, i) => ({ id: `import_${Date.now()}_${i}`, raw: line, reviewed: false }));
  }

  function approveRouteVisibleReviewItems(items) {
    return (items || []).filter(it => it && !it.reviewed).map(it => ({ ...it, reviewed: true, approvedAt: Date.now() }));
  }

  function createSafeJobSyncPayload(jobs) {
    if (!Array.isArray(jobs)) return [];
    return jobs.map(j => ({
      id: j.id, title: j.title, address: j.address, pay: j.pay,
      tier: j.tier, transit: j.transit, due: j.due, status: j.status,
      campaign: j.campaign, minutes: j.minutes,
    }));
  }

  function publicCredentialState(connections) {
    // Returns only non-secret connection status metadata
    const out = {};
    for (const [k, v] of Object.entries(connections || {})) {
      out[k] = { status: v.status || 'not_connected', label: v.label || '', updatedAt: v.updatedAt || null };
    }
    return out;
  }

  return { normalizeSharePayload, createImportReviewItems, approveRouteVisibleReviewItems, createSafeJobSyncPayload, publicCredentialState };
});
