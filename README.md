# Linked Jobs Route Planner

This repository is a separate route-planner app for linked job data.

It is not the Shopify project.

## What it does

- Uses a local dashboard login that lasts 7 days
- Keeps live job data coming in from a signed-in browser tab or browser extension
- Lets you filter jobs, select stops, and open a route in Google Maps
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

## Live data sync

The browser extension posts visible job rows from the main Jobslinger MegaLog page to:

- `POST /api/jobs`

That endpoint is left open for sync so the app does not depend on a browser session staying open.
The extension also polls on a timer, so updates keep flowing even when the page does not mutate.

The Jobslinger login page includes a square-click challenge, so the reliable flow is:

1. Log in on the main Jobslinger page in Chrome
2. Load the unpacked extension
3. Keep the route planner running and the extension will stream live rows into it

## Save live login

Use the dashboard’s Live Source panel to store the Jobslinger site login locally.

- The data is written only to the ignored backend data folder
- The password is never shown back in the UI
- If the site is offline, the dashboard still shows the last successful scrape from disk

## Install the browser extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the [`browser-extension`](browser-extension) folder from this repository
5. Open the main Jobslinger page in the browser and keep the dashboard running at `http://localhost:3300/`

If the page layout changes, the extension may need selector tweaks, but it will stay live as long as the page is open and the local route planner is running.

## API

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/events`
- `POST /api/start`
- `POST /api/scrape`

## Android

The `android/` folder is a starter WebView app that loads the local route-planner UI.
