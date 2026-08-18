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

3. Open:

   - `http://localhost:3300/login`
   - `http://localhost:3300/`

## Live data sync

The browser extension posts visible job rows to:

- `POST /api/jobs`

That endpoint is left open for sync so the app does not depend on a browser session staying open.

## API

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/events`
- `POST /api/start`
- `POST /api/scrape`

## Android

The `android/` folder is a starter WebView app that loads the local route-planner UI.

