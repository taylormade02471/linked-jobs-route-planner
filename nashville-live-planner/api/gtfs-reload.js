// api/gtfs-reload.js — returns WeGo route metadata from embedded static data
// The full stop data (1613 stops) is already bundled in planner-data.js.
// This endpoint returns routeColors + routeIdToShort so the client can
// verify they are in sync, plus a server timestamp for cache invalidation.
// Keeping it fast and dependency-free avoids Vercel's 10s function timeout.

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

// route_id -> short name (from GTFS trips.txt / routes.txt)
const ROUTE_ID_TO_SHORT = {
  "3":"3","4":"4","6":"6","7":"7","8":"8","9":"9",
  "14":"14","17":"17","18":"18","19":"19","22":"22","23":"23",
  "28":"28","29":"29","34":"34","41":"41","42":"42","50":"50",
  "52":"52","55":"55","56":"56","64":"64","70":"70","71":"71",
  "75":"75","76":"76","77":"77","79":"79","84":"84","86":"86",
  "87":"87","88":"88","89":"89","90":"90","93":"93","94":"94","95":"95",
};

const ROUTE_NAMES = {
  "3":"West End / Hillsboro","4":"Nolensville Pike","6":"Cockrill Bend",
  "7":"Bordeaux","8":"Briley Pkwy","9":"Murfreesboro Pike",
  "14":"Charlotte Pike","17":"Dickerson Pike","18":"Gallatin Pike",
  "19":"Madison","22":"Clarksville Pike","23":"Whites Creek",
  "28":"Old Hickory / Donelson","29":"Hermitage","34":"Opry Mills",
  "41":"4th Ave N / Church St","42":"Shelby Ave / McGavock Pike",
  "50":"Harding Pike","52":"Hillwood / White Bridge",
  "55":"Whites Creek / Joelton","56":"Clarksville — Nashville Express",
  "64":"Madison Pike","70":"Ellington Pkwy / Inglewood",
  "71":"Airport / Elm Hill Pike","75":"Lebanon Pike",
  "76":"Bell Rd","77":"Nolensville Pk — Brentwood",
  "79":"Thompson Ln","84":"Brick Church Pike",
  "86":"Antioch Pike","87":"WeGo Star: Donelson–Riverfront",
  "88":"WeGo Star: Mt. Juliet–Riverfront","89":"Hendersonville",
  "90":"Smyrna–La Vergne–Murfreesboro Express","93":"West Nashville Express",
  "94":"Clarksville Route 94","95":"Gallatin–Hendersonville Express",
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=43200, stale-while-revalidate=3600");

  const routeCount = Object.keys(ROUTE_COLORS).length;
  res.status(200).json({
    fetchedAt: new Date().toISOString(),
    routeCount,
    stopCount: 1613,
    source: "embedded-gtfs-2026-08",
    routeColors: ROUTE_COLORS,
    routeIdToShort: ROUTE_ID_TO_SHORT,
    routeNames: ROUTE_NAMES,
  });
};
