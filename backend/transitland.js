const axios = require("axios");
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { parse } = require("csv-parse/sync");
const {
  buildTransitRouteSections,
  findScheduledTransitLeg,
  formatRouteLegDisplay,
} = require("../shared/domain/transitRouteSections");
const {
  ALL_ACCESSIBLE_ROUTES,
  ALL_SELECTED_ROUTE_SECTIONS,
  ALL_STOPS_SELECTED,
  buildTransitFilterState,
  transitAccessForJob,
} = require("../shared/domain/transitFilters");
const { normalizeMoneyToCents } = require("../shared/domain/jobSchema");

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
  const [routesRows, tripsRows, stopsRows, stopTimesRows, shapesRows] = await Promise.all([
    parseCsvFromZip(zipFile, "routes\\.txt"),
    parseCsvFromZip(zipFile, "trips\\.txt"),
    parseCsvFromZip(zipFile, "stops\\.txt"),
    parseCsvFromZip(zipFile, "stop_times\\.txt"),
    parseCsvFromZip(zipFile, "shapes\\.txt"),
  ]);

  const routes = routesRows.map((row) => ({
    route_id: row.route_id || "",
    route_short_name: row.route_short_name || "",
    route_long_name: row.route_long_name || "",
    route_desc: row.route_desc || "",
    route_type: row.route_type || "",
  }));

  const trips = tripsRows.map((row) => ({
    route_id: row.route_id || "",
    service_id: row.service_id || "",
    trip_id: row.trip_id || "",
    trip_headsign: row.trip_headsign || "",
    direction_id: row.direction_id || "",
    block_id: row.block_id || "",
    shape_id: row.shape_id || "",
  }));

  const stops = stopsRows.map((row) => ({
    stop_id: row.stop_id || "",
    name: row.stop_name || "",
    stop_name: row.stop_name || "",
    lat: Number.parseFloat(row.stop_lat),
    lon: Number.parseFloat(row.stop_lon),
    stop_lat: row.stop_lat || "",
    stop_lon: row.stop_lon || "",
    desc: row.stop_desc || "",
    stop_desc: row.stop_desc || "",
    code: row.stop_code || "",
    stop_code: row.stop_code || "",
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

  const shapes = shapesRows.map((row) => ({
    shape_id: row.shape_id || "",
    shape_pt_lat: Number.parseFloat(row.shape_pt_lat),
    shape_pt_lon: Number.parseFloat(row.shape_pt_lon),
    shape_pt_sequence: Number.parseInt(row.shape_pt_sequence || "0", 10),
    shape_dist_traveled: row.shape_dist_traveled || "",
  }));

  return { routes, trips, stops, stop_times, shapes };
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
  const { routes, trips, stops, stop_times, shapes } = await extractGtfsArtifacts(outZip);

  const payload = {
    importedAt: new Date().toISOString(),
    onestopId,
    feed,
    feedUrl: zipUrl,
    source: {
      type: "static_gtfs",
      verified: true,
      source_label: "Scheduled estimate",
    },
    routes,
    trips,
    stops,
    stop_times,
    shapes,
  };

  fs.writeFileSync(cachePathFor(onestopId), JSON.stringify(payload, null, 2), "utf8");
  return {
    ok: true,
    onestopId,
    feedUrl: zipUrl,
    routesCount: routes.length,
    tripsCount: trips.length,
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
  return Boolean(loadGtfsCache(onestopId));
}

function hasVerifiedGtfsSchedule(onestopId) {
  const cache = loadGtfsCache(onestopId);
  return Boolean(
    cache &&
      Array.isArray(cache.routes) &&
      Array.isArray(cache.trips) &&
      Array.isArray(cache.stops) &&
      Array.isArray(cache.stop_times),
  );
}

async function importGtfsFromLocalZip({ filePath, onestopId = CTS_DEFAULT_ONESTOP_ID, feedUrl = "local-zip" } = {}) {
  const zipFile = resolveLocalGtfsZipPath(filePath);
  if (!zipFile) {
    throw new Error("No local CTS GTFS zip file was found");
  }
  const { routes, trips, stops, stop_times, shapes } = await extractGtfsArtifacts(zipFile);
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
    source: {
      type: "static_gtfs",
      verified: true,
      source_label: "Scheduled estimate",
    },
    routes,
    trips,
    stops,
    stop_times,
    shapes,
  };
  fs.writeFileSync(cachePathFor(onestopId), JSON.stringify(payload, null, 2), "utf8");
  return {
    ok: true,
    onestopId,
    feedUrl,
    zipFile,
    routesCount: routes.length,
    tripsCount: trips.length,
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

function scheduleInputFromCache(cache) {
  return {
    routes: Array.isArray(cache?.routes) ? cache.routes : [],
    trips: Array.isArray(cache?.trips) ? cache.trips : [],
    stops: Array.isArray(cache?.stops) ? cache.stops : [],
    stop_times: Array.isArray(cache?.stop_times) ? cache.stop_times : [],
    source: cache?.source || {
      type: "static_gtfs",
      source_label: "Scheduled estimate",
    },
  };
}

function getTransitPickerData({ onestopId, jobs = [], plans = [], selection = {} } = {}) {
  const cache = loadGtfsCache(onestopId);
  const scheduleInput = scheduleInputFromCache(cache);
  const sections = cache ? buildTransitRouteSections(scheduleInput) : [];
  const state = buildTransitFilterState({
    jobs,
    plans,
    sections,
    selection,
  });

  return {
    ok: true,
    onestopId,
    imported: Boolean(cache),
    verified_schedule: sections.length > 0,
    source_label: sections[0]?.source_label || (cache ? "Scheduled estimate" : ""),
    plan_options: state.plan_options,
    corridors: state.corridors,
    sections: state.sections,
    stops: state.stops,
    job_ids: state.jobs.map((job) => job.id).filter(Boolean),
    selection: state.selection,
    counts: {
      routes: sections.length ? new Set(sections.map((section) => section.route_id)).size : 0,
      sections: sections.length,
      accessible_jobs: state.jobs.length,
    },
  };
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

function jobPayCents(job = {}) {
  return normalizeMoneyToCents(
    job.pay_cents ??
      job.payCents ??
      job.pay ??
      job.detail_fields?.shop_pay ??
      job.detail_fields?.pay
  );
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
  const payCents = jobPayCents(job);
  const transitBonus = plan?.mode === "transit_walk" ? 18 : plan?.mode === "walk_only" ? 8 : -8;
  const walkPenalty = Number.isFinite(plan?.legs?.[0]?.distance_km) ? plan.legs[0].distance_km * 12 : 0;
  const visitPenalty = Number.isFinite(job?.estimated_minutes) ? job.estimated_minutes / 3 : 0;
  const moneyBoost = Math.min(45, payCents / 100);
  const urgencyBoost = [120, 100, 82, 62, 35][duePriority.rank] || 20;
  const proximityBoost = Number.isFinite(directKm) ? Math.max(0, 40 - directKm * 10) : 0;
  const cursorClusterBoost = Number.isFinite(fromCursorKm) ? Math.max(0, 24 - fromCursorKm * 8) : 0;
  const daysPenalty = Number.isFinite(duePriority.days) ? Math.max(0, duePriority.days) * 6 : 20;
  return urgencyBoost + moneyBoost + transitBonus + proximityBoost + cursorClusterBoost - walkPenalty - visitPenalty - daysPenalty;
}

function stopLabel(stop) {
  if (!stop) return "";
  return stop.name || stop.stop_name || stop.stop_id || "";
}

function stopArray(value) {
  return (Array.isArray(value) ? value : [value]).filter(
    (stop) => stop && stop.stop_id && Number.isFinite(stop.lat) && Number.isFinite(stop.lon),
  );
}

function selectedRouteIds(selection = {}) {
  const values = Array.isArray(selection.corridor_ids)
    ? selection.corridor_ids
    : Array.isArray(selection.corridorIds)
    ? selection.corridorIds
    : [];
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== ALL_ACCESSIBLE_ROUTES);
}

function selectedSectionIds(selection = {}) {
  const sectionId = String(selection.section_id || selection.sectionId || "").trim();
  return sectionId && sectionId !== ALL_SELECTED_ROUTE_SECTIONS ? [sectionId] : [];
}

function selectedStopId(selection = {}) {
  const stopId = String(selection.stop_id || selection.stopId || "").trim();
  return stopId && stopId !== ALL_STOPS_SELECTED ? stopId : "";
}

function estimatedWalkMinutes(distanceKm) {
  if (!Number.isFinite(distanceKm)) return null;
  return Math.max(1, Math.ceil((distanceKm / 4.8) * 60));
}

function buildTransitLegs(
  origin,
  destination,
  originStops,
  destinationStops,
  directKm,
  cache,
  transitSelection = {},
  job = {},
) {
  const originCandidates = stopArray(originStops);
  const destinationCandidates = stopArray(destinationStops);
  const scheduledLeg = cache
    ? findScheduledTransitLeg({
        ...scheduleInputFromCache(cache),
        origin_stop_ids: originCandidates.map((stop) => stop.stop_id),
        destination_stop_ids: destinationCandidates.map((stop) => stop.stop_id),
        route_ids: selectedRouteIds(transitSelection),
        section_ids: selectedSectionIds(transitSelection),
        stop_id: selectedStopId(transitSelection),
      })
    : null;

  if (scheduledLeg) {
    const boardStop = scheduledLeg.start_stop;
    const exitStop = scheduledLeg.end_stop;
    const originWalkKm = haversineKm(origin, boardStop);
    const destinationWalkKm = haversineKm(destination, exitStop);
    const transitKm = haversineKm(boardStop, exitStop);
    const transitViable =
      Number.isFinite(originWalkKm) &&
      Number.isFinite(destinationWalkKm) &&
      originWalkKm <= 1.75 &&
      destinationWalkKm <= 1.75;

    if (transitViable) {
      const access = transitAccessForJob(job);
      const transitDetails = {
        ...scheduledLeg,
        board_stop: boardStop,
        exit_stop: exitStop,
        walk_time_minutes: access.walk_time_minutes ?? estimatedWalkMinutes(destinationWalkKm),
        job_work_time_minutes:
          access.job_work_time_minutes ?? estimateCompletionMinutes(job, { mode: "transit_walk" }),
        buffer_risk_label:
          access.buffer_risk_label ||
          (scheduledLeg.source_label === "Live verified"
            ? "Live timing verified"
            : "Scheduled estimate - allow timing buffer"),
      };
      const transitDisplay = formatRouteLegDisplay(transitDetails);
      const rideSeconds = Math.max(
        0,
        (toSeconds(scheduledLeg.scheduled_dropoff_time) || 0) -
          (toSeconds(scheduledLeg.scheduled_pickup_time) || 0),
      );
      const directionText = scheduledLeg.direction ? ` toward ${scheduledLeg.direction}` : "";

      return {
        mode: "transit_walk",
        rideShareSuggested: false,
        score: Math.max(0, 100 - originWalkKm * 18 - destinationWalkKm * 18 - directKm * 2),
        summary: `Route ${scheduledLeg.route_short_name}${directionText}: scheduled transit to the job`,
        transit_details: {
          ...transitDetails,
          ...transitDisplay,
          scheduled_ride_minutes: rideSeconds ? Math.ceil(rideSeconds / 60) : null,
          origin_walk_time_minutes: estimatedWalkMinutes(originWalkKm),
        },
        legs: [
          {
            mode: "walk",
            from: { ...origin, label: "Start" },
            to: { ...boardStop, label: stopLabel(boardStop) },
            distance_km: originWalkKm,
            maps_url: directionsUrl(origin, boardStop, "walking"),
          },
          {
            mode: "transit",
            from: { ...boardStop, label: stopLabel(boardStop) },
            to: { ...exitStop, label: stopLabel(exitStop) },
            distance_km: transitKm,
            route_id: scheduledLeg.route_id,
            route_short_name: scheduledLeg.route_short_name,
            route_long_name: scheduledLeg.route_long_name,
            direction: scheduledLeg.direction,
            trip_id: scheduledLeg.trip_id,
            scheduled_pickup_time: scheduledLeg.scheduled_pickup_time,
            scheduled_dropoff_time: scheduledLeg.scheduled_dropoff_time,
            source_label: scheduledLeg.source_label,
            maps_url: directionsUrl(boardStop, exitStop, "transit"),
          },
          {
            mode: "walk",
            from: { ...exitStop, label: stopLabel(exitStop) },
            to: { ...destination, label: "Job" },
            distance_km: destinationWalkKm,
            maps_url: directionsUrl(exitStop, destination, "walking"),
          },
        ],
      };
    }
  }

  const walkOnlyViable = Number.isFinite(directKm) && directKm <= 2.5;
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
    summary: "No verified scheduled transit connection was found for this job",
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

async function buildTransitRoutePlan({ onestopId, origin, jobs = [], plans = [], transitSelection = {} }) {
  const cache = loadGtfsCache(onestopId);
  const picker = getTransitPickerData({
    onestopId,
    jobs,
    plans,
    selection: transitSelection,
  });
  const transitEnabled = picker.verified_schedule;
  const selectionProvided = Object.keys(transitSelection || {}).length > 0;
  const accessibleJobIds = new Set(picker.job_ids.map((jobId) => String(jobId)));
  const scopedJobs = selectionProvided
    ? jobs.filter((job) => accessibleJobIds.has(String(job.id)))
    : jobs;

  const originCoordinate = coordinateFromJob(origin) ||
    (origin && origin.address ? await geocodeAddress(origin.address).catch(() => null) : null);

  if (!originCoordinate) {
    throw new Error("Could not resolve the live starting location");
  }

  const candidateJobs = [];
  for (const job of scopedJobs) {
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
      originStops,
      jobStops,
      haversineKm(
        { lat: originCoordinate.lat, lon: originCoordinate.lon },
        { lat: resolved.lat, lon: resolved.lon }
      ),
      cache,
      picker.selection,
      job,
    );
    const estimatedPayCents = jobPayCents(job);

    candidateJobs.push({
      jobId: job.id,
      title: job.title || "Job",
      client: job.client || "",
      address: job.address || "",
      city: job.city || "",
      state: job.state || "",
      postcode: job.postcode || "",
      source_url: job.source_url || "",
      pay: job.pay || job.detail_fields?.shop_pay || "",
      estimated_pay_cents: estimatedPayCents,
      transit_access: job.transit_access || job.transitAccess || null,
      accessible_route_ids: job.accessible_route_ids || job.accessibleRouteIds || [],
      accessible_section_ids: job.accessible_section_ids || job.accessibleSectionIds || [],
      accessible_stop_ids: job.accessible_stop_ids || job.accessibleStopIds || [],
      detail_fields: job.detail_fields || {},
      destination: resolved,
      origin_stop: plan.transit_details?.board_stop || null,
      destination_stop: plan.transit_details?.exit_stop || null,
      origin_stop_candidates: plan.transit_details?.board_stop ? [plan.transit_details.board_stop] : [],
      destination_stop_candidates: plan.transit_details?.exit_stop ? [plan.transit_details.exit_stop] : [],
      due_date: parseDueDateText(job),
      estimated_minutes: estimateCompletionMinutes(job, plan),
      due_priority: getDuePriority(job),
      route_value_score: routeScore(job, plan, haversineKm(
        { lat: originCoordinate.lat, lon: originCoordinate.lon },
        { lat: resolved.lat, lon: resolved.lon }
      )),
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
        originStops,
        jobStops,
        directKm,
        cache,
        picker.selection,
        item,
      );
      const payCents = jobPayCents(item);
      const clusterBoost = Number.isFinite(directKm) ? Math.max(0, 20 - directKm * 7) : 0;
      const transitClusterBoost = plan.mode === "transit_walk" ? 12 : plan.mode === "walk_only" ? 4 : 0;
      const moneyBoost = Math.min(55, payCents / 100);
      const minutes = Math.max(15, Number(item.estimated_minutes) || 45);
      const efficiencyBoost = Math.min(35, (payCents / 100) / (minutes / 60 || 1) / 2);
      const dynamicScore =
        plan.score +
        moneyBoost +
        efficiencyBoost +
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
      originStops,
      jobStops,
      directKm,
      cache,
      picker.selection,
      chosen,
    );

    route.push({
      ...chosen,
      ...plan,
      from: { ...cursor, label: route.length ? route[route.length - 1].title : "Live location" },
      to: chosen.destination,
      direct_distance_km: directKm,
      estimated_minutes: chosen.estimated_minutes || null,
      origin_stop: plan.transit_details?.board_stop || null,
      destination_stop: plan.transit_details?.exit_stop || null,
      origin_stop_candidates: plan.transit_details?.board_stop ? [plan.transit_details.board_stop] : [],
      destination_stop_candidates: plan.transit_details?.exit_stop ? [plan.transit_details.exit_stop] : [],
      origin_walk_km: plan.legs[0]?.distance_km || null,
      destination_walk_km: plan.legs[2]?.distance_km || plan.legs[0]?.distance_km || null,
      transit_distance_km: plan.legs[1]?.distance_km || null,
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
      source_label: picker.source_label || "",
      accessible_jobs: scopedJobs.length,
      estimated_pay_cents: route.reduce((total, item) => total + (Number(item.estimated_pay_cents) || 0), 0),
      selection_message:
        transitEnabled && !scopedJobs.length
          ? "No jobs have verified route, section, or stop access for this selection."
          : "",
    },
  };
}

module.exports = {
  importGtfsForOperator,
  importGtfsFromLocalZip,
  loadGtfsCache,
  hasGtfsCache,
  hasVerifiedGtfsSchedule,
  nearestStops,
  geocodeAddress,
  getTransitPickerData,
  buildTransitRoutePlan,
  CTS_DEFAULT_ONESTOP_ID,
};
