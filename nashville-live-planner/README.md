# Nashville Live Audit Transit Planner

Isolated planner for the **current Nashville audit set only**. It intentionally does not use old JobSlinger/job-board links or historical provider connections.

## Current work set

- 18 quick photo/tobacco audits supplied in the current planning conversation.
- Requested quick-audit incentive: **$8.50 each**.
- One deliberate 1-hour anchor: **7601 Hwy 70 S**, $38.50, completed first.
- Wednesday service date: **2026-08-26**.

## Phone work app backbone

The Nashville URL now includes a browser-local phone work app layer for:

- Survey Merchandiser
- Clickworker
- Field Nation
- Field Agent

Jobs added, shared, or pasted from those apps are saved in the browser on that device. The planner ranks open available work against the user's current/map location, pay, work time, and verified Nashville planner address matches. Matched open jobs are shown as bright green pins; claimed/assigned jobs are shown as yellow pins.

The Android wrapper can attempt to open installed provider apps by package name. It also accepts `text/plain` Android shares so visible provider job details can be sent into the planner import box for review. This does not scrape private app storage, bypass app security, or copy provider sessions.

Payment-center snapshots can be pasted from visible provider screens and stored locally for field reference. Payment rows are app data only; they are not provider credentials and are not committed.

Provider connection status is also browser-local app data. The planner can remember that a provider is signed in on this device and can reopen that provider's official app/login surface, but it does not store provider passwords, tokens, cookies, MFA codes, or API keys in source code, GitHub, Vercel, or browser storage.

The camera tool requests permission only when the user taps **Start camera**. Captured photos stay in browser storage and can be attached to a phone-app job for field reference. The public Vercel app does not receive provider passwords or log into private phone apps.

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
- Browser geolocation is enabled in the planner. The page can request phone location permission, continuously update a **YOU ARE HERE** marker, show accuracy, and center the map on the user.
- Camera capture is enabled for local job-card/reference photos when the browser or Android wrapper grants camera permission.
- Network access is required for the map tiles and `/api/wego-live` GTFS-Realtime proxy.

Official WeGo realtime endpoints: https://www.wegotransit.com/contact-us/data-request-submission/

## Vercel

Create a Vercel project with this folder (`nashville-live-planner`) as the project root. No Google API key is required for the planner itself. Leaflet/OpenStreetMap is used for the map; WeGo GTFS/GTFS-Realtime supplies transit truth.

## Important field constraint

Route 94 Wednesday GTFS used here:
- Clarksville Exit 11 -> Nashville Central: **5:48 AM -> 6:35 AM**
- Last planned Nashville Central -> Clarksville Exit 11: **5:10 PM -> 6:06 PM**

`3721 Clarksville Hwy` is not treated as a direct Route 22 stop. The planner correctly marks the Bordeaux last-mile as **WeGo Link required** from a designated transfer point rather than inventing a fixed-route stop.

## Deployment trigger

Location-enabled field build confirmed in source on 2026-08-25. This commit intentionally triggers the connected Vercel Git deployment.
