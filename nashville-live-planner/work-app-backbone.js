(function registerWorkAppBackbone(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.WorkAppBackbone = api;
})(typeof window !== "undefined" ? window : globalThis, function workAppBackboneFactory() {
  const PROVIDERS = [
    {
      id: "survey_merchandiser",
      label: "Survey Merchandiser",
      connection: "External app session",
      boardUrl: "https://survey.com/",
      loginUrl: "https://survey.com/",
      connectionHelp: "Use the Survey Merchandiser app for sign-in, then save only this planner's local connection status.",
    },
    {
      id: "clickworker",
      label: "Clickworker",
      connection: "Workplace or phone app session",
      boardUrl: "https://workplace.clickworker.com/",
      loginUrl: "https://workplace.clickworker.com/",
      connectionHelp: "Open the official Workplace login or phone app; the planner stores status, not the Clickworker password.",
    },
    {
      id: "field_nation",
      label: "Field Nation",
      connection: "External app session",
      boardUrl: "https://fieldnation.com/",
      loginUrl: "https://fieldnation.com/",
      connectionHelp: "Use Field Nation's platform or app for sign-in; this planner only stores non-secret connection metadata.",
    },
  ];

  const SAFE_CONNECTION_STATUSES = new Set(["not_connected", "signed_in_external", "needs_login"]);
  const SECRET_FIELD_PATTERN = /(password|passcode|token|secret|cookie|session|authorization|bearer|api[_-]?key|csrf)/i;

  const STREET_PATTERN = /\b\d{2,6}\s+[^,\n]*(?:street|st|avenue|ave|road|rd|pike|hwy|highway|lane|ln|drive|dr|boulevard|blvd|way|court|ct|circle|cir|place|pl)\b[^,\n]*(?:,\s*[^,\n]+){0,3}/i;

  function asText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function providerById(providerId) {
    const id = asText(providerId).toLowerCase();
    return PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[0];
  }

  function safeConnectionStatus(value) {
    const status = asText(value).toLowerCase();
    return SAFE_CONNECTION_STATUSES.has(status) ? status : "not_connected";
  }

  function sanitizeConnectionSettings(settings = {}) {
    const provider = providerById(settings.provider_id);
    const safe = {
      provider_id: provider.id,
      status: safeConnectionStatus(settings.status),
      account_label: asText(settings.account_label).slice(0, 90),
      notes: asText(settings.notes).slice(0, 180),
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    Object.keys(settings || {}).forEach((key) => {
      if (SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
    });

    return safe;
  }

  function connectionLabel(connection) {
    const status = safeConnectionStatus(connection?.status);
    if (status === "signed_in_external") return "Connected on this phone/browser";
    if (status === "needs_login") return "Needs sign-in";
    return "Not connected yet";
  }

  function normalizeStatus(value) {
    const text = asText(value).toLowerCase();
    if (text.includes("paid") || text.includes("complete") || text.includes("done")) return "completed";
    if (text.includes("submitted") || text.includes("applied") || text.includes("requested")) return "applied";
    if (text.includes("planned") || text.includes("accepted") || text.includes("assigned")) return "planned";
    if (text.includes("available") || text.includes("open")) return "available";
    return text || "available";
  }

  function isOpenAvailableJob(job) {
    const status = normalizeStatus(job?.status);
    return status === "available" || status === "open";
  }

  function moneyToCents(value) {
    const match = asText(value).match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    return match ? Math.round(Number(match[1]) * 100) : 0;
  }

  function centsLabel(cents) {
    const value = Number(cents);
    return Number.isFinite(value) && value > 0 ? "$" + (value / 100).toFixed(2) : "Pay not listed";
  }

  function minutesFrom(value) {
    const text = asText(value).toLowerCase();
    const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)/);
    if (minuteMatch) return Math.max(5, Math.round(Number(minuteMatch[1])));
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs)/);
    if (hourMatch) return Math.max(15, Math.round(Number(hourMatch[1]) * 60));
    return 30;
  }

  function normalizeAddress(value) {
    return asText(value)
      .toLowerCase()
      .replace(/\b(highway)\b/g, "hwy")
      .replace(/\b(street)\b/g, "st")
      .replace(/\b(avenue)\b/g, "ave")
      .replace(/\b(road)\b/g, "rd")
      .replace(/\b(lane)\b/g, "ln")
      .replace(/\b(drive)\b/g, "dr")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function jobId(job) {
    return [
      job.provider_id,
      normalizeAddress(job.address),
      asText(job.title).toLowerCase(),
      Number(job.pay_cents) || 0,
    ]
      .filter(Boolean)
      .join(":")
      .slice(0, 180);
  }

  function parseSharedJobs(text, providerId = "survey_merchandiser") {
    const provider = providerById(providerId);
    const blocks = String(text || "")
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).map(asText).filter(Boolean);
      const address = (block.match(STREET_PATTERN) || [])[0] || "";
      const pay = (block.match(/\$\s*\d+(?:\.\d{1,2})?/) || [])[0] || "";
      const dueLine = lines.find((line) => /\b(due|deadline|date|starts?|arrival|window)\b/i.test(line)) || "";
      const title =
        lines.find((line) => line !== address && line !== pay && !/\b(due|deadline|date|status)\b/i.test(line)) ||
        provider.label + " job";
      const statusLine = lines.find((line) => /\b(status|available|open|applied|requested|accepted|assigned)\b/i.test(line)) || "available";
      const job = {
        id: "",
        provider_id: provider.id,
        provider_label: provider.label,
        title,
        address: asText(address),
        pay_cents: moneyToCents(pay),
        due: dueLine,
        minutes: minutesFrom(block),
        status: normalizeStatus(statusLine),
        source: "phone-app-import",
        source_text: block,
        order: index + 1,
      };
      job.id = jobId(job) || provider.id + ":" + Date.now() + ":" + index;
      return job;
    });
  }

  function routeJobCoordinates(data) {
    const byJob = new Map();
    const byAddress = new Map();

    Object.values(data?.sections || {}).forEach((section) => {
      (section.legs || []).forEach((leg) => {
        const stop = leg.alight_stop || leg.board_stop;
        if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return;
        const point = {
          lat: stop.lat,
          lon: stop.lon,
          label: leg.destination || stop.name,
          stopName: stop.name,
          route: leg.route,
        };

        [leg.job, leg.extra_job].filter(Boolean).forEach((id) => byJob.set(id, point));
        if (leg.destination) byAddress.set(normalizeAddress(leg.destination), point);
      });
    });

    Object.entries(data?.jobs || {}).forEach(([id, job]) => {
      const point = byJob.get(id);
      if (point && job?.address) byAddress.set(normalizeAddress(job.address), point);
    });

    return { byJob, byAddress };
  }

  function coordinateForJob(job, data) {
    const lat = Number(job?.lat);
    const lon = Number(job?.lon ?? job?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, source: "imported coordinates" };

    const { byAddress } = routeJobCoordinates(data);
    const normalized = normalizeAddress(job?.address);
    if (!normalized) return null;

    if (byAddress.has(normalized)) {
      return { ...byAddress.get(normalized), source: "matched Nashville planner address" };
    }

    for (const [knownAddress, point] of byAddress.entries()) {
      if (knownAddress.includes(normalized) || normalized.includes(knownAddress)) {
        return { ...point, source: "matched Nashville planner address" };
      }
    }

    return null;
  }

  function haversineMiles(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const toRad = (degrees) => (degrees * Math.PI) / 180;
    const earthMiles = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthMiles * Math.asin(Math.sqrt(h));
  }

  function scoreJob(job, data, origin) {
    const coord = coordinateForJob(job, data);
    const distanceMiles = coord && origin ? haversineMiles(origin, coord) : Number.POSITIVE_INFINITY;
    const payCents = Number(job?.pay_cents) || 0;
    const minutes = Math.max(5, Number(job?.minutes) || 30);
    const hourlyCents = Math.round(payCents / (minutes / 60));
    const mappedBoost = coord ? 25 : -45;
    const distancePenalty = Number.isFinite(distanceMiles) ? distanceMiles * 4 : 20;
    const score = payCents / 100 + hourlyCents / 300 + mappedBoost - distancePenalty;

    return {
      ...job,
      coordinate: coord,
      distance_miles: Number.isFinite(distanceMiles) ? distanceMiles : null,
      hourly_cents: hourlyCents,
      recommendation_score: Math.round(score * 10) / 10,
      recommendation_reason: coord
        ? centsLabel(payCents) + ", " + minutes + " min, " + distanceMiles.toFixed(1) + " mi from you"
        : centsLabel(payCents) + ", " + minutes + " min, needs verified location",
    };
  }

  function recommendJobs(jobs, data, origin) {
    return (Array.isArray(jobs) ? jobs : [])
      .filter(isOpenAvailableJob)
      .map((job) => scoreJob(job, data, origin))
      .sort((a, b) => b.recommendation_score - a.recommendation_score);
  }

  return {
    PROVIDERS,
    centsLabel,
    connectionLabel,
    coordinateForJob,
    isOpenAvailableJob,
    moneyToCents,
    normalizeAddress,
    normalizeStatus,
    parseSharedJobs,
    providerById,
    recommendJobs,
    sanitizeConnectionSettings,
    scoreJob,
  };
});
