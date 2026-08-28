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

export default async function handler(req, res) {
  try {
    const [vehiclePositions, tripUpdates, alerts] = await Promise.all([
      fetchFirstBuffer("vehiclePositions"),
      fetchFirstBuffer("tripUpdates"),
      fetchFirstBuffer("alerts"),
    ]);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      vehiclePositions: vehiclePositions.data,
      tripUpdates: tripUpdates.data,
      alerts: alerts.data,
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
