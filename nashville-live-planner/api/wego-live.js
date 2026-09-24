export const config = { runtime: "nodejs" };

const FEEDS = {
  vehiclePositions: [
    "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb",
    "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/gtfs-realtime/trapezerealtimefeed.pb",
  ],
  tripUpdates: [
    "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb",
  ],
  alerts: [
    "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/alert/alerts.pb",
  ],
};

async function fetchBuffer(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "linked-jobs-route-planner/wego-live" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return Buffer.from(bytes).toString("base64");
}

async function fetchFirstBuffer(feedName) {
  const urls = FEEDS[feedName] || [];
  const errors = [];
  for (const url of urls) {
    try {
      return { data: await fetchBuffer(url), sourceUrl: url };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`${feedName} unavailable: ${errors.join("; ")}`);
}

// ── Minimal protobuf parser (varint + length-delimited only) ──────────────────
function readVarint(u8, s) {
  let val = 0, shift = 0;
  while (s.i < u8.length) {
    const b = u8[s.i++];
    val += (b & 127) * Math.pow(2, shift);
    if (!(b & 128)) return val;
    shift += 7;
  }
  return val;
}
function parseFields(u8) {
  const s = { i: 0 }, out = [];
  while (s.i < u8.length) {
    const key = readVarint(u8, s), n = Math.floor(key / 8), w = key & 7;
    let v;
    if (w === 0) v = readVarint(u8, s);
    else if (w === 1) { v = u8.slice(s.i, s.i + 8); s.i += 8; }
    else if (w === 2) { const l = readVarint(u8, s); v = u8.slice(s.i, s.i + l); s.i += l; }
    else if (w === 5) { v = u8.slice(s.i, s.i + 4); s.i += 4; }
    else break;
    out.push([n, w, v]);
  }
  return out;
}
const td = new TextDecoder();
const str = (v) => { try { return td.decode(v); } catch { return ""; } };

// Parse a TripUpdate entity → { route_id, stop_time_updates: [{stop_id, arrival_time, departure_time}] }
function parseTripUpdate(u8) {
  const d = { route_id: "", stop_time_updates: [] };
  for (const [n, w, v] of parseFields(u8)) {
    if (n === 1 && w === 2) {
      // TripDescriptor
      for (const [tn, tw, tv] of parseFields(v)) {
        if (tn === 5 && tw === 2) d.route_id = str(tv); // route_id field
      }
    }
    if (n === 2 && w === 2) {
      // StopTimeUpdate
      const stu = { stop_id: "", arrival_time: null, departure_time: null };
      for (const [sn, sw, sv] of parseFields(v)) {
        if (sn === 4 && sw === 2) stu.stop_id = str(sv);
        if (sn === 2 && sw === 2) {
          // StopTimeEvent (arrival)
          for (const [en, ew, ev] of parseFields(sv)) {
            if (en === 2 && ew === 0) stu.arrival_time = ev; // time (unix)
          }
        }
        if (sn === 3 && sw === 2) {
          // StopTimeEvent (departure)
          for (const [en, ew, ev] of parseFields(sv)) {
            if (en === 2 && ew === 0) stu.departure_time = ev;
          }
        }
      }
      d.stop_time_updates.push(stu);
    }
  }
  return d;
}

// Decode base64 protobuf → [{route_id, stop_time_updates}]
function decodeTripUpdates(b64) {
  if (!b64) return [];
  const raw = Buffer.from(b64, "base64");
  const u8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
  const updates = [];
  for (const [n, w, v] of parseFields(u8)) {
    if (n !== 2 || w !== 2) continue;
    for (const [en, ew, ev] of parseFields(v)) {
      if (en === 3 && ew === 2) updates.push(parseTripUpdate(ev)); // trip_update field
    }
  }
  return updates;
}

// Build stop→arrivals index: { stop_id → [{route_id, time_unix, mins_away}] }
function buildStopArrivals(tripUpdates) {
  const now = Math.floor(Date.now() / 1000);
  const index = {};
  for (const tu of tripUpdates) {
    for (const stu of tu.stop_time_updates) {
      const t = stu.arrival_time || stu.departure_time;
      if (!t || !stu.stop_id) continue;
      const mins = Math.round((t - now) / 60);
      if (mins < -2 || mins > 90) continue; // skip past/far-future
      if (!index[stu.stop_id]) index[stu.stop_id] = [];
      index[stu.stop_id].push({ route_id: tu.route_id, time_unix: t, mins_away: mins });
    }
  }
  // Sort each stop's arrivals by time
  for (const sid of Object.keys(index)) {
    index[sid].sort((a, b) => a.time_unix - b.time_unix);
    index[sid] = index[sid].slice(0, 5); // keep next 5 per stop
  }
  return index;
}

export default async function handler(req, res) {
  try {
    const [vehiclePositions, tripUpdates, alerts] = await Promise.all([
      fetchFirstBuffer("vehiclePositions"),
      fetchFirstBuffer("tripUpdates"),
      fetchFirstBuffer("alerts"),
    ]);

    // Decode trip updates server-side to build stop arrivals index
    const tuDecoded = decodeTripUpdates(tripUpdates.data);
    const stopArrivals = buildStopArrivals(tuDecoded);

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      vehiclePositions: vehiclePositions.data,
      tripUpdates: tripUpdates.data,
      alerts: alerts.data,
      stopArrivals,           // NEW: { stop_id → [{route_id, time_unix, mins_away}] }
      tripUpdateCount: tuDecoded.length,
      sourceUrls: {
        vehiclePositions: vehiclePositions.sourceUrl,
        tripUpdates: tripUpdates.sourceUrl,
        alerts: alerts.sourceUrl,
      },
    });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
