// api/gtfs-reload.js — fetches live WeGo GTFS zip and returns fresh routes + stops
export const config = { runtime: "nodejs" };

const GTFS_URL = "https://www.wegotransit.com/GoogleExport/google_transit.zip";

const ROUTE_COLORS = {
  "3":"#0060A9","4":"#E07B39","6":"#1B6B3A","7":"#8B4513","8":"#666699",
  "9":"#009999","14":"#CC3300","17":"#993366","18":"#336699","19":"#996633",
  "22":"#A71930","23":"#522D80","28":"#005A8B","29":"#00843D",
  "34":"#FF6600","41":"#6B8E23","42":"#8B0000","50":"#F58220",
  "52":"#0075C9","55":"#CC6600","56":"#ED1C24","64":"#999900",
  "70":"#006633","71":"#663399","75":"#003366","76":"#6E6E6E",
  "77":"#CC0066","79":"#336600","84":"#990000","86":"#003399",
  "87":"#CC3399","88":"#339966","89":"#996600","90":"#333399",
  "93":"#CC0033","94":"#005596","95":"#006666",
};

// Minimal CSV parser (handles quoted fields)
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || "").trim());
    return obj;
  });
}

// Unzip without external deps — use Node's built-in zlib + manual ZIP parsing
import { inflateRaw } from "zlib";
import { promisify } from "util";
const inflateRawAsync = promisify(inflateRaw);

function readUint32LE(buf, offset) {
  return buf[offset] | (buf[offset+1]<<8) | (buf[offset+2]<<16) | (buf[offset+3]<<24);
}
function readUint16LE(buf, offset) {
  return buf[offset] | (buf[offset+1]<<8);
}

async function unzipFiles(buf, wantedFiles) {
  const result = {};
  let i = 0;
  while (i < buf.length - 4) {
    // Local file header signature
    if (buf[i] !== 0x50 || buf[i+1] !== 0x4B || buf[i+2] !== 0x03 || buf[i+3] !== 0x04) { i++; continue; }
    const compression = readUint16LE(buf, i + 8);
    const compressedSize = readUint32LE(buf, i + 18);
    const filenameLen = readUint16LE(buf, i + 26);
    const extraLen = readUint16LE(buf, i + 28);
    const filename = buf.slice(i + 30, i + 30 + filenameLen).toString("utf8");
    const dataStart = i + 30 + filenameLen + extraLen;
    const compressedData = buf.slice(dataStart, dataStart + compressedSize);

    if (wantedFiles.includes(filename)) {
      let content;
      if (compression === 0) {
        content = compressedData.toString("utf8");
      } else if (compression === 8) {
        const decompressed = await inflateRawAsync(compressedData);
        content = decompressed.toString("utf8");
      }
      if (content) result[filename] = content;
    }
    i = dataStart + compressedSize;
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=43200"); // cache 12 hours

  try {
    // Fetch GTFS zip from WeGo
    const gtfsRes = await fetch(GTFS_URL, {
      cache: "no-store",
      headers: { "User-Agent": "linked-jobs-route-planner/gtfs-reload" },
    });
    if (!gtfsRes.ok) throw new Error(`GTFS fetch failed: ${gtfsRes.status}`);
    const gtfsBytes = Buffer.from(await gtfsRes.arrayBuffer());

    // Extract only the files we need
    const files = await unzipFiles(gtfsBytes, ["routes.txt", "stops.txt", "trips.txt", "stop_times.txt"]);

    if (!files["routes.txt"] || !files["stops.txt"] || !files["trips.txt"] || !files["stop_times.txt"]) {
      throw new Error("Missing required GTFS files in zip");
    }

    const routes = parseCSV(files["routes.txt"]);
    const stops = parseCSV(files["stops.txt"]);
    const trips = parseCSV(files["trips.txt"]);
    const stopTimes = parseCSV(files["stop_times.txt"]);

    // Build stop lookup
    const stopLookup = {};
    for (const s of stops) stopLookup[s.stop_id] = s;

    // Build trip → route lookup
    const tripRoute = {};
    for (const t of trips) tripRoute[t.trip_id] = t.route_id;

    // One representative trip per route (first seen)
    const firstTripPerRoute = {};
    for (const t of trips) {
      if (!firstTripPerRoute[t.route_id]) firstTripPerRoute[t.route_id] = t.trip_id;
    }

    // Build route → sorted stops
    const routeStops = {};
    for (const st of stopTimes) {
      const rid = tripRoute[st.trip_id];
      if (!rid || firstTripPerRoute[rid] !== st.trip_id) continue;
      if (!routeStops[rid]) routeStops[rid] = [];
      const stop = stopLookup[st.stop_id];
      if (stop) {
        routeStops[rid].push({
          seq: parseInt(st.stop_sequence, 10) || 0,
          id: stop.stop_id,
          name: stop.stop_name,
          lat: parseFloat(stop.stop_lat),
          lon: parseFloat(stop.stop_lon),
        });
      }
    }

    // Build final wegoRoutes object
    const routeLookup = {};
    for (const r of routes) routeLookup[r.route_id] = r;

    const wegoRoutes = {};
    const routeColors = {};
    const routeIdToShort = {};

    for (const rid of Object.keys(routeStops)) {
      const r = routeLookup[rid];
      if (!r) continue;
      const num = r.route_short_name;
      const sortedStops = routeStops[rid]
        .sort((a, b) => a.seq - b.seq)
        .map(({ id, name, lat, lon }) => ({ id, name, lat, lon }));

      wegoRoutes[num] = {
        name: r.route_long_name,
        color: ROUTE_COLORS[num] || "#555555",
        stops: sortedStops,
      };
      routeColors[num] = ROUTE_COLORS[num] || "#555555";
      routeIdToShort[rid] = num;
    }

    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      routeCount: Object.keys(wegoRoutes).length,
      stopCount: stops.length,
      wegoRoutes,
      routeColors,
      routeIdToShort,
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
