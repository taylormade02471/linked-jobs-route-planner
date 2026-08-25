export const config = { runtime: "nodejs" };

const FEEDS = {
  vehiclePositions: "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb",
  tripUpdates: "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb",
  alerts: "http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/alert/alerts.pb",
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

export default async function handler(req, res) {
  try {
    const [vehiclePositions, tripUpdates, alerts] = await Promise.all([
      fetchBuffer(FEEDS.vehiclePositions),
      fetchBuffer(FEEDS.tripUpdates),
      fetchBuffer(FEEDS.alerts),
    ]);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      vehiclePositions,
      tripUpdates,
      alerts,
    });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
