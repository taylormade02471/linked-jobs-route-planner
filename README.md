# Linked Jobs Route Planner

This repository is a separate route-planner app for linked job data.

It is not the Shopify project.

## What it does

- Opens the Nashville phone planner directly at the local root URL
- Keeps the current saved jobs available for offline planning
- Lets Android sync cleaned provider job data when you choose to show jobs on the map
- Lets you use the phone's current location to create a furthest-first return route
- Includes a free Android skeleton that points at the local app

## Primary planner and legacy dashboard

The phone planner is the primary application. It does not require the old desktop dashboard login:

- `http://localhost:3300/` - Nashville planner
- `http://localhost:3300/nashville-live-planner/` - redirects to the primary planner

The previous desktop dashboard remains available at `http://localhost:3300/legacy/`. Its session and API protections are unchanged and can be configured through ignored backend environment files.

Provider passwords are not stored in the planner source or sent to the browser.

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

3. Open the planner:

   - `http://localhost:3300/`

4. On the phone, allow location, then press `Plan current jobs`. The route begins from that current location, shows the saved job details, and labels CTS timing as a RideCTS verification step rather than inventing bus times.

## Job data sync

The website starts empty. Android provider logins stay on the phone, and only cleaned job records should be synced to the backend when you choose to show jobs on the planner map.

This empty-launch build reads new ignored data files, so older local `data/jobs.json` and `data/provider-jobs.json` files are not shown by default.

Safe provider jobs can be posted to:

- `POST /api/provider-jobs`

That endpoint strips credential-shaped fields before saving route-visible jobs.

## API

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/provider-jobs`
- `POST /api/provider-jobs`
- `GET /api/events`
- `POST /api/start`
- `POST /api/scrape`

## Android

The `android/` folder is a starter WebView app that loads the local route-planner UI.
