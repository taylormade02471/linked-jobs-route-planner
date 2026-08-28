# Linked Jobs Route Planner

This repository is a separate route-planner app for linked job data.

It is not the Shopify project.

## What it does

- Uses a local dashboard login that lasts 7 days
- Starts with no posted jobs
- Lets Android sync cleaned provider job data when you choose to show jobs on the map
- Lets you filter jobs, select stops, and open a route in Google Maps
- Includes a free Android skeleton that points at the local app

## Local login

The dashboard login is separate from any linked-account website login.

Default local credentials:

- Username: `kyle`
- Password: `taylor`

You can override them in `backend/.env` or `backend/.env.local`. Those files are ignored by Git and loaded before the local server starts.

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
