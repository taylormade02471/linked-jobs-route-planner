# Nashville Live Audit Transit Planner

Isolated planner for the **current Nashville audit set only**. It intentionally does not use old JobSlinger/job-board links or historical provider connections.

## Current work set

- 18 quick photo/tobacco audits supplied in the current planning conversation.
- Requested quick-audit incentive: **$8.50 each**.
- One deliberate 1-hour anchor: **7601 Hwy 70 S**, $38.50, completed first.
- Wednesday service date: **2026-08-26**.

## UI

1. **Planned route** — Plan A/B/C/D.
2. **Itinerary section** — numbered from Clarksville -> Nashville forward in actual order; return to Clarksville is a separate RETURN section.
3. **Stop / route view** — starts with **All Stops in Planned Route**, then all stops in the selected section, then individual planned legs.

The map draws only GTFS geometry between the boarding and getting-off stops used by the selected plan. It never draws the entire WeGo line unless the plan actually uses that entire segment.

## Static + live data

- Static route geometry, stop names/IDs, and Wednesday schedule estimates come from the supplied `google_transit.zip`.
- `/api/wego-live` proxies WeGo's official GTFS-Realtime vehicle, trip-update, and alert feeds server-side.
- Frontend refresh interval: **30 seconds**.
- If live data fails, the static Wednesday route remains usable and the UI does not silently substitute an old GPS snapshot.

Official WeGo realtime endpoints: https://www.wegotransit.com/contact-us/data-request-submission/

## Vercel

Create a Vercel project with this folder (`nashville-live-planner`) as the project root. No Google API key is required for the planner itself. Leaflet/OpenStreetMap is used for the map; WeGo GTFS/GTFS-Realtime supplies transit truth.

## Important field constraint

Route 94 Wednesday GTFS used here:
- Clarksville Exit 11 -> Nashville Central: **5:48 AM -> 6:35 AM**
- Last planned Nashville Central -> Clarksville Exit 11: **5:10 PM -> 6:06 PM**

`3721 Clarksville Hwy` is not treated as a direct Route 22 stop. The planner correctly marks the Bordeaux last-mile as **WeGo Link required** from a designated transfer point rather than inventing a fixed-route stop.
