const axios = require("axios");
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { parse } = require("csv-parse/sync");

const DATA_DIR = path.join(__dirname, "data");
const CACHE_DIR = path.join(DATA_DIR, "transitland");
const GEO_CACHE_PATH = path.join(CACHE_DIR, "geocodes.json");
const API_BASE_URL = "https://transit.land/api/v2/rest";
const API_KEY = String(process.env.TRANSITLAND_API_KEY || process.env.TRANSITLAND_APIKEY || "");
const CTS_DEFAULT_ONESTOP_ID = "o-clarksville~tn~us";
let lastGeocodeRequestAt = 0;

fs.mkdirSync(CACHE_DIR, { recursive: true });

function sanitizeKey(value) {
  return String(value || "").replace(/[^a-z0-9._-]/gi, "_");
}

function cachePathFor(onestopId) {
  return path.join(CACHE_DIR, `${sanitizeKey(onestopId)}.json`);
}

function zipPathFor(onestopId) {
  return path.join(CACHE_DIR, `${sanitizeKey(onestopId)}.zip`);
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function withApiKey(params = {}) {
  if (!API_KEY) return params;
  return {
    ...params,
    apikey: API_KEY,
  };
}

function collectFeeds(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.feeds)) return payload.feeds.filter(Boolean);
  if (Array.isArray(payload.data)) return payload.data.filter(Boolean);
  if (payload.feed) return [payload.feed];
  return [];
}

function feedDownloadUrl(feed) {
  return (
    feed?.urls?.static_current ||
    feed?.latest_version?.download_url ||
    feed?.latest_version?.url ||
    feed?.url ||
    feed?.fetch_project_url ||
    ""
  );
}

async function requestJson(endpoint, params = {}) {
  const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
    params: withApiKey(params),
    timeout: 60000,
    headers: {
      "User-Agent": "linked-jobs-route-planner/1.0",
    },
  });
  return response.data;
}

async function findFeedRecord(onestopId) {
  const attempts = [
    [`/feeds/${encodeURIComponent(onestopId)}`, {}],
    ["/feeds", { onestop_id: onestopId, limit: 1 }],
    ["/feeds", { search: onestopId, limit: 5 }],
    ["/feeds", { operator_onestop_id: onestopId, limit: 5 }],
  ];

  for (const [endpoint, params] of attempts) {
    try {
      const payload = await requestJson(endpoint, params);
      const feeds = collectFeeds(payload);
      if (feeds.length) {
        return feeds[0];
      }
    } catch (error) {
      console.error("Transitland feed lookup failed", endpoint, error && error.message ? error.message : error);
    }
  }

  return null;
}

async function downloadGtfs(zipUrl, outPath) {
  const response = await axios.get(zipUrl, {
    responseType: "stream",
    timeout: 120000,
    maxContentLength: 1024 * 1024 * 1024,
    headers: {
      "User-Agent": "linked-jobs-route-planner/1.0",
    },
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function toSeconds(value) {
  if (!value) return null;
  const parts = String(value).split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
  return parts[0] * 3600 + parts[1] * 60 + (Number.isFinite(parts[2]) ? parts[2] : 0);
}

async function parseCsvFromZip(zipFile, targetName) {
  const directory = await unzipper.Open.file(zipFile);
  const entry = directory.files.find((file) => new RegExp(`${targetName}$`, "i").test(file.path));
  if (!entry) return [];
  const content = await entry.buffer();
  return parse(content.toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

async function extractGtfsArtifacts(zipFile) {
  const [stopsRows, stopTimesRows] = await Promise.all([
    parseCsvFromZip(zipFile, "stops\\.txt"),
    parseCsvFromZip(zipFile, "stop_times\\.txt"),
  ]);

  const stops = stopsRows.map((row) => ({
    stop_id: row.stop_id || "",
    name: row.stop_name || "",
    lat: Number.parseFloat(row.stop_lat),
    lon: Number.parseFloat(row.stop_lon),
    desc: row.stop_desc || "",
    code: row.stop_code || "",
    zone_id: row.zone_id || "",
  }));

  const stop_times = stopTimesRows.map((row) => ({
    trip_id: row.trip_id || "",
    arrival_time: row.arrival_time || "",
    departure_time: row.departure_time || "",
    stop_id: row.stop_id || "",
    stop_sequence: Number.parseInt(row.stop_sequence || "0", 10),
    arrival_s: toSeconds(row.arrival_time),
    departure_s: toSeconds(row.departure_time),
  }));

  return { stops, stop_times };
}

async function importGtfsForOperator(onestopId) {
  const feed = await findFeedRecord(onestopId);
  if (!feed) {
    throw new Error("No Transitland feed was found for that operator");
  }

  const zipUrl = feedDownloadUrl(feed);
  if (!zipUrl) {
    throw new Error("Transitland feed record did not include a downloadable static GTFS URL");
  }

  const outZip = zipPathFor(onestopId);
  await downloadGtfs(zipUrl, outZip);
  const { stops, stop_times } = await extractGtfsArtifacts(outZip);

  const payload = {
    importedAt: new Date().toISOString(),
    onestopId,
    feed,
    feedUrl: zipUrl,
    stops,
    stop_times,
  };

  fs.writeFileSync(cachePathFor(onestopId), JSON.stringify(payload, null, 2), "utf8");
  return {
    ok: true,
    onestopId,
    feedUrl: zipUrl,
    stopsCount: stops.length,
    stopTimesCount: stop_times.length,
  };
}

function resolveLocalGtfsZipPath(filePath) {
  const candidates = [];
  if (filePath) candidates.push(filePath);
  if (process.env.CTS_GTFS_ZIP_PATH) candidates.push(process.env.CTS_GTFS_ZIP_PATH);
  candidates.push(
    path.join(process.env.USERPROFILE || "", "Downloads", "CTS_gtfs_84 (1)_202511250912075697.zip"),
    path.join(process.env.USERPROFILE || "", "Downloads", "CTS_gtfs.zip")
  );
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function hasGtfsCache(onestopId) {
  return fs.existsSync(cachePathFor(onestopId));
}

async function importGtfsFromLocalZip({ filePath, onestopId = CTS_DEFAULT_ONESTOP_ID, feedUrl = "local-zip" } = {}) {
  const zipFile = resolveLocalGtfsZipPath(filePath);
  if (!zipFile) {
    throw new Error("No local CTS GTFS zip file was found");
  }
  const { stops, stop_times } = await extractGtfsArtifacts(zipFile);
  const payload = {
    importedAt: new Date().toISOString(),
    onestopId,
    feedUrl,
    zipFile,
    feed: {
      id: onestopId,
      spec: "gtfs",
      urls: {
        static_current: feedUrl,
      },
    },
    stops,
    stop_times,
  };
  fs.writeFileSync(cachePathFor(onestopId), JSON.stringify(payload, null, 2), "utf8");
  return {
    ok: true,
    onestopId,
    feedUrl,
    zipFile,
    stopsCount: stops.length,
    stopTimesCount: stop_times.length,
  };
}

function loadGtfsCache(onestopId) {
  const filePath = cachePathFor(onestopId);
  const cache = loadJson(filePath, null);
  if (!cache) return null;
  return cache;
}

function haversineKm(a, b) {
  const radiusKm = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function nearestStops(onestopId, lat, lon, count = 5) {
  const cache = loadGtfsCache(onestopId);
  if (!cache || !Array.isArray(cache.stops)) return null;

  const origin = {
    lat: Number.parseFloat(lat),
    lon: Number.parseFloat(lon),
  };

  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
    return null;
  }

  return cache.stops
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .map((stop) => ({
      ...stop,
      dist_km: haversineKm(origin, { lat: stop.lat, lon: stop.lon }),
    }))
    .sort((left, right) => left.dist_km - right.dist_km)
    .slice(0, Number.isFinite(count) ? count : 5);
}

function geocodeCacheKey(query) {
  return sanitizeKey(String(query || "").toLowerCase());
}

function loadGeocodeCache() {
  return loadJson(GEO_CACHE_PATH, {});
}

function saveGeocodeCache(cache) {
  saveJson(GEO_CACHE_PATH, cache);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobAddressQuery(job = {}) {
  return [
    job.address,
    [job.city, job.state, job.postcode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")
    .trim();
}

async function geocodeAddress(query) {
  const cleaned = String(query || "").trim();
  if (!cleaned) return null;

  const cache = loadGeocodeCache();
  const key = geocodeCacheKey(cleaned);
  if (cache[key]) return cache[key];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", cleaned);

  const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastGeocodeRequestAt = Date.now();

  let response = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(url, {
      headers: {
        "User-Agent": "linked-jobs-route-planner/1.0",
        "Accept-Language": "en-US,en;q=0.8",
      },
    }).catch((error) => {
      if (attempt === 0) return null;
      throw error;
    });
    if (response && response.ok) break;
    if (attempt === 0) {
      await sleep(1000);
      continue;
    }
    break;
  }
  if (!response || !response.ok) {
    throw new Error(`Geocoder request failed: ${response ? response.status : "network"}`);
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return null;

  const result = {
    query: cleaned,
    lat: Number.parseFloat(first.lat),
    lon: Number.parseFloat(first.lon),
    display_name: first.display_name || cleaned,
  };
  cache[key] = result;
  saveGeocodeCache(cache);
  return result;
}

function coordinateFromJob(job = {}) {
  const lat = Number.parseFloat(job.lat);
  const lon = Number.parseFloat(job.lng ?? job.lon ?? job.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
    return { lat, lon, source: "job" };
  }
  return null;
}

function directionsUrl(origin, destination, mode = "transit") {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  }
  if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lon)) {
    url.searchParams.set("destination", `${destination.lat},${destination.lon}`);
  }
  url.searchParams.set("travelmode", mode);
  return url.toString();
}

function parseDueDateText(job) {
  const fields = job?.detail_fields || {};
  const raw = String(
    fields.submit_due ||
    fields.due ||
    job?.due ||
    job?.deadline ||
    ""
  ).trim();
  if (!raw) return null;

  const dateMatch = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!dateMatch) return null;

  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear();
  const dueDate = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(dueDate.getTime()) ? dueDate : null;
}

function estimateCompletionMinutes(job, plan) {
  const details = job?.detail_fields || {};
  const raw = String(
    details.estimated_time ||
    details.estimated_minutes ||
    details.time_to_complete ||
    job?.time_to_complete ||
    job?.duration ||
    ""
  ).toLowerCase();
  const numericMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)/i);
  if (numericMatch) {
    return Math.max(10, Number(numericMatch[1]));
  }
  if (/hour/.test(raw)) {
    const hours = Number((raw.match(/(\d+(?:\.\d+)?)\s*hour/i) || [])[1] || 1);
    return Math.max(30, Math.round(hours * 60));
  }
  if (plan?.mode === "transit_walk") return 45;
  if (plan?.mode === "walk_only") return 35;
  return 55;
}

function getDuePriority(job) {
  const dueDate = job?.due_date instanceof Date ? job.due_date : parseDueDateText(job);
  if (!dueDate) {
    return { rank: 4, days: Number.POSITIVE_INFINITY };
  }
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const days = Math.floor((due - today) / 86400000);
  if (days < 0) return { rank: 0, days };
  if (days === 0) return { rank: 1, days };
  if (days === 1) return { rank: 2, days };
  if (days <= 3) return { rank: 3, days };
  return { rank: 4, days };
}

function routeScore(job, plan, directKm, fromCursorKm) {
  const duePriority = getDuePriority(job);
  const transitBonus = plan?.mode === "transit_walk" ? 18 : plan?.mode === "walk_only" ? 8 : -8;
  const walkPenalty = Number.isFinite(plan?.legs?.[0]?.distance_km) ? plan.legs[0].distance_km * 12 : 0;
  const visitPenalty = Number.isFinite(job?.estimated_minutes) ? job.estimated_minutes / 3 : 0;
  const urgencyBoost = [120, 100, 82, 62, 35][duePriority.rank] || 20;
  const proximityBoost = Number.isFinite(directKm) ? Math.max(0, 40 - directKm * 10) : 0;
  const cursorClusterBoost = Number.isFinite(fromCursorKm) ? Math.max(0, 24 - fromCursorKm * 8) : 0;
  const daysPenalty = Number.isFinite(duePriority.days) ? Math.max(0, duePriority.days) * 6 : 20;
  return urgencyBoost + transitBonus + proximityBoost + cursorClusterBoost - walkPenalty - visitPenalty - daysPenalty;
}

function stopLabel(stop) {
  if (!stop) return "";
  return stop.name || stop.stop_name || stop.stop_id || "";
}

function buildTransitLegs(origin, destination, originStop, destinationStop, directKm) {
  const originWalkKm = originStop ? haversineKm(origin, originStop) : null;
  const destinationWalkKm = destinationStop ? haversineKm(destination, destinationStop) : null;
  const transitKm =
    originStop && destinationStop ? haversineKm(originStop, destinationStop) : null;
  const transitViable =
    originStop &&
    destinationStop &&
    Number.isFinite(originWalkKm) &&
    Number.isFinite(destinationWalkKm) &&
    originWalkKm <= 1.75 &&
    destinationWalkKm <= 1.75;
  const walkOnlyViable = Number.isFinite(directKm) && directKm <= 2.5;

  if (transitViable) {
    return {
      mode: "transit_walk",
      rideShareSuggested: false,
      score: Math.max(0, 100 - originWalkKm * 18 - destinationWalkKm * 18 - directKm * 2),
      summary: "Walk to transit, ride, then walk to the job",
      legs: [
        {
          mode: "walk",
          from: { ...origin, label: "Start" },
          to: { ...originStop, label: stopLabel(originStop) },
          distance_km: originWalkKm,
          maps_url: directionsUrl(origin, originStop, "walking"),
        },
        {
          mode: "transit",
          from: { ...originStop, label: stopLabel(originStop) },
          to: { ...destinationStop, label: stopLabel(destinationStop) },
          distance_km: transitKm,
          maps_url: directionsUrl(originStop, destinationStop, "transit"),
        },
        {
          mode: "walk",
          from: { ...destinationStop, label: stopLabel(destinationStop) },
          to: { ...destination, label: "Job" },
          distance_km: destinationWalkKm,
          maps_url: directionsUrl(destinationStop, destination, "walking"),
        },
      ],
    };
  }

  if (walkOnlyViable) {
    return {
      mode: "walk_only",
      rideShareSuggested: false,
      score: Math.max(0, 80 - directKm * 18),
      summary: "Walking is the simplest option for this job",
      legs: [
        {
          mode: "walk",
          from: { ...origin, label: "Start" },
          to: { ...destination, label: "Job" },
          distance_km: directKm,
          maps_url: directionsUrl(origin, destination, "walking"),
        },
      ],
    };
  }

  return {
    mode: "no_route",
    rideShareSuggested: true,
    score: Math.max(0, 20 - directKm * 3),
    summary: "No practical walk/transit option found",
    legs: [],
  };
}

async function resolveJobCoordinate(job = {}) {
  const direct = coordinateFromJob(job);
  if (direct) return direct;

  const query = jobAddressQuery(job);
  if (!query) return null;

  const geo = await geocodeAddress(query).catch((error) => {
    console.error("Geocode failed", error && error.message ? error.message : error);
    return null;
  });
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return null;
  return { lat: geo.lat, lon: geo.lon, source: "geocode", query: geo.query, display_name: geo.display_name };
}

async function buildTransitRoutePlan({ onestopId, origin, jobs = [] }) {
  const cache = loadGtfsCache(onestopId);
  const transitEnabled = Boolean(cache);

  const originCoordinate = coordinateFromJob(origin) ||
    (origin && origin.address ? await geocodeAddress(origin.address).catch(() => null) : null);

  if (!originCoordinate) {
    throw new Error("Could not resolve the live starting location");
  }

  const candidateJobs = [];
  for (const job of jobs) {
    const resolved = await resolveJobCoordinate(job);
    if (!resolved) continue;
    const originStops = transitEnabled
      ? nearestStops(onestopId, originCoordinate.lat, originCoordinate.lon, 3) || []
      : [];
    const jobStops = transitEnabled
      ? nearestStops(onestopId, resolved.lat, resolved.lon, 3) || []
      : [];
    const plan = buildTransitLegs(
      { lat: originCoordinate.lat, lon: originCoordinate.lon },
      { lat: resolved.lat, lon: resolved.lon },
      originStops[0],
      jobStops[0],
      haversineKm(
        { lat: originCoordinate.lat, lon: originCoordinate.lon },
        { lat: resolved.lat, lon: resolved.lon }
      )
    );

    candidateJobs.push({
      jobId: job.id,
      title: job.title || "Job",
      client: job.client || "",
      address: job.address || "",
      city: job.city || "",
      state: job.state || "",
      postcode: job.postcode || "",
      source_url: job.source_url || "",
      destination: resolved,
      origin_stop: originStops[0] || null,
      destination_stop: jobStops[0] || null,
      due_date: parseDueDateText(job),
      estimated_minutes: estimateCompletionMinutes(job, plan),
      due_priority: getDuePriority(job),
      ...plan,
    });
  }

  candidateJobs.sort((left, right) => {
    if ((left.due_priority?.rank ?? 4) !== (right.due_priority?.rank ?? 4)) {
      return (left.due_priority?.rank ?? 4) - (right.due_priority?.rank ?? 4);
    }
    const leftEffort = (left.estimated_minutes || 0) + (left.legs[0]?.distance_km || 0) * 8;
    const rightEffort = (right.estimated_minutes || 0) + (right.legs[0]?.distance_km || 0) * 8;
    if (leftEffort !== rightEffort) return leftEffort - rightEffort;
    if (right.score !== left.score) return right.score - left.score;
    const leftDistance = left.legs[0]?.distance_km || Number.POSITIVE_INFINITY;
    const rightDistance = right.legs[0]?.distance_km || Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  });

  let cursor = { lat: originCoordinate.lat, lon: originCoordinate.lon };
  const route = [];
  const remaining = candidateJobs.slice();

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      const directKm = haversineKm(cursor, item.destination);
      const duePriority = item.due_priority || getDuePriority(item);
      const duePenalty = duePriority.rank * 12 + Math.max(0, duePriority.days || 0) * 3;
      const effortPenalty = (item.estimated_minutes || 0) / 30;
      const originStops = transitEnabled
        ? nearestStops(onestopId, cursor.lat, cursor.lon, 3) || []
        : [];
      const jobStops = transitEnabled
        ? nearestStops(onestopId, item.destination.lat, item.destination.lon, 3) || []
        : [];
      const plan = buildTransitLegs(
        cursor,
        item.destination,
        originStops[0],
        jobStops[0],
        directKm
      );
      const clusterBoost = Number.isFinite(directKm) ? Math.max(0, 20 - directKm * 7) : 0;
      const transitClusterBoost = plan.mode === "transit_walk" ? 12 : plan.mode === "walk_only" ? 4 : 0;
      const dynamicScore =
        plan.score +
        clusterBoost +
        transitClusterBoost -
        route.length * 1.5 -
        directKm * 1.25 -
        duePenalty -
        effortPenalty;
      if (dynamicScore > bestScore) {
        bestScore = dynamicScore;
        bestIndex = index;
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0];
    const originStops = transitEnabled
      ? nearestStops(onestopId, cursor.lat, cursor.lon, 3) || []
      : [];
    const jobStops = transitEnabled
      ? nearestStops(onestopId, chosen.destination.lat, chosen.destination.lon, 3) || []
      : [];
    const directKm = haversineKm(cursor, chosen.destination);
    const plan = buildTransitLegs(
      cursor,
      chosen.destination,
      originStops[0],
      jobStops[0],
      directKm
    );

    route.push({
      ...chosen,
      ...plan,
      from: { ...cursor, label: route.length ? route[route.length - 1].title : "Live location" },
      to: chosen.destination,
      direct_distance_km: directKm,
      estimated_minutes: chosen.estimated_minutes || null,
      origin_walk_km: chosen.legs[0]?.distance_km || null,
      destination_walk_km: chosen.legs[2]?.distance_km || chosen.legs[0]?.distance_km || null,
      transit_distance_km: chosen.legs[1]?.distance_km || null,
      route_url: directionsUrl(cursor, chosen.destination, plan.mode === "walk_only" ? "walking" : "transit"),
    });

    cursor = chosen.destination;
  }

  return {
    ok: true,
    onestopId,
    origin: originCoordinate,
    route,
    summary: {
      jobs: route.length,
      transit_enabled: transitEnabled ? route.filter((item) => item.mode === "transit_walk").length : 0,
      walk_only: route.filter((item) => item.mode === "walk_only").length,
      no_route: route.filter((item) => item.mode === "no_route").length,
      transit_data_loaded: transitEnabled,
    },
  };
}

module.exports = {
  importGtfsForOperator,
  importGtfsFromLocalZip,
  loadGtfsCache,
  hasGtfsCache,
  nearestStops,
  geocodeAddress,
  buildTransitRoutePlan,
  CTS_DEFAULT_ONESTOP_ID,
};
