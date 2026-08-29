# Linked Jobs Route Planner

This repository is a separate route-planner app for linked job data.

It is not the Shopify project.

## What it does

- Uses a local dashboard login that lasts 7 days
- Keeps live job data coming in from a signed-in browser tab or browser extension
- Splits active jobs and completed jobs into separate tabs
- Lets you open a job page in a new tab from the app
- Lets you filter jobs, select stops, and open a route in Google Maps
- Can import GTFS feeds with routes, trips, stops, stop times, and optional shapes
- Uses a verified three-level transit picker: plan option, corridor, then route section or exact stop
- Shows transit legs only when a GTFS trip actually connects the boarding and exit stops
- Includes a free Android skeleton that points at the local app

## Local login

The dashboard login is separate from any linked-account website login.

Default local credentials:

- Username: `kyle`
- Password: `taylor`

You can override them in `backend/.env`.

## Run locally

1. Install dependencies:

   ```powershell
   cd backend
   npm install
   ```

2. Start the server:

   ```powershell
   npm start
   ```

   This runs `backend/server_live.js` on port `3300` from the repository root.

3. Open:

   - `http://localhost:3300/login`
   - `http://localhost:3300/`

By default the desktop server binds to `127.0.0.1`, so it is local-only on your computer. To intentionally allow another device on your trusted network to reach it, start it with `HOST=0.0.0.0`. The `/api/health` response reports whether network access is enabled.

## Target work apps

The active target providers are:

- Survey Merchandiser
- Clickworker
- Field Nation

These are phone-app-first sources. The planner should use a verified share, export, web board, email, or official API path for each provider. It must not read private app storage, bypass login challenges, or store provider passwords in tracked files.

## Live data sync

Provider connections send normalized open jobs to:

- `POST /api/jobs`

The planner is designed to recommend work from open available jobs, not from jobs you have already submitted, marked paid, completed, or moved into awaiting payment. The route planner compares the linked-board jobs against your current location, due dates, pay, route clustering, nearby GTFS stops, and walking time. Route recommendations include estimated route pay when the job board provides pay data.

## Save source settings

Use the dashboard's Phone App Sources panel to store non-secret source settings, such as a provider web login URL or job board URL if that provider offers one.

- The data is written only to the ignored backend data folder
- Provider passwords should not be stored in source code or GitHub
- If a provider does not expose a web board/API/share flow, mark it as needing a phone connection rather than inventing jobs

## Install the browser extension

The current unpacked extension is legacy Jobslinger-specific. It is not the main direction for Survey Merchandiser, Clickworker, or Field Nation until provider-specific phone/web adapters are verified.

1. Open Chrome and go to `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the [`browser-extension`](browser-extension) folder from this repository
5. Keep the dashboard running at `http://localhost:3300/`

If the page layout changes, the extension may need selector tweaks, but it will stay live as long as the page is open and the local route planner is running.

## Verified transit selection

The transit picker is intentionally fail-closed. It only shows route sections when the cached GTFS feed has matching `routes.txt`, `trips.txt`, `stops.txt`, and `stop_times.txt` records. Static GTFS results are always labeled **Scheduled estimate**. A future verified real-time source may label its result **Live verified**.

Jobs can declare their approved transit access without creating route names or sections in the app. A job's optional fields use IDs from the verified GTFS cache:

```json
{
  "plan_ids": ["today"],
  "transit_access": {
    "route_ids": ["verified-route-id"],
    "section_ids": ["verified-route-id:direction-id:start-stop-id:end-stop-id"],
    "stop_ids": ["verified-stop-id"],
    "walk_time_minutes": 7,
    "job_work_time_minutes": 30,
    "buffer_risk_label": "Scheduled estimate - allow timing buffer"
  }
}
```

With no verified job-to-route, section, or stop relationship, the dashboard says so rather than inferring or inventing a transit section. The backend exposes the current picker shape at `GET /api/transit-picker`.

## API

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/events`
- `POST /api/start`
- `POST /api/scrape`
- `POST /api/import-gtfs`
- `POST /api/import-cts-zip`
- `GET /api/gtfs/status`
- `GET /api/gtfs/nearest`
- `GET /api/transit-picker`
- `POST /api/route-plan`

## Android

The `android/` folder is a starter WebView app that loads the local route-planner UI.
