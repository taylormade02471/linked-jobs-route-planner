# Linked Jobs Route Planner

This is a separate GitHub-ready web app for route planning from synced job-account data. It is not the Shopify Product Intelligence project and does not share Shopify code, Shopify credentials, Shopify APIs, or storefront routing.

The app stores the latest synced job rows locally, lets you select job stops, and opens the selected stops in maps for efficient travel around town. It uses port `3300` by default so it stays separate from Shopify or Next.js projects that commonly use port `3000`.

## What It Does

- Saves synced job rows from linked account pages to `data/jobs.json`.
- Serves the latest job feed at `http://localhost:3300/api/jobs`.
- Shows a route-planning dashboard at `http://localhost:3300`.
- Supports optional basic auth for dashboard/API access.
- Supports Server-Sent Events at `/api/events` for phone or Android clients.
- Lets you filter jobs, select stops, export CSV, and open selected locations in Google Maps.
- Includes a Chrome extension that auto-syncs the visible JobSlinger Plus MegaLog table while you stay signed in normally.

## What It Does Not Do

- It does not store passwords.
- It does not automate login.
- It does not bypass verification checks.
- It does not publish private job data.
- It does not connect to Shopify.

## Run Locally

Node.js 20 or later is required. `npm install` is safe to run, but there are no third-party backend dependencies.

```powershell
cd "C:\Users\kylet\.copilot\chats\f3a3a81f-1058-4fdf-95b3-0bba33dbb983\backend"
npm install
node server.js
```

Open `http://localhost:3300`.

## Optional Auth

Copy `backend/.env.example` to `backend/.env`, then change the password before sharing the app through ngrok.

```env
PORT=3300
APP_USER=kyle
APP_PASSWORD=change-this-before-sharing
```

When auth is enabled, use that username and password for the dashboard, `/api/jobs`, and `/api/events`. The browser extension can still post synced job rows to `/api/jobs`.

## Automatic Job Sync

The `browser-extension` folder contains a local Chrome extension. It only runs on the MegaLog URL and posts visible table rows to your local server when the page loads, changes, or becomes visible again.

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select the `browser-extension` folder from this project.
5. Keep the local server running and open `https://www.jobslingerplus.com/MegaLog`.

## Manual Job Sync

The dashboard also provides a manual sync snippet. Use it only as a backup if the extension is not loaded.

1. Sign in to JobSlinger Plus in your browser.
2. Open `Tools` then `MegaLog`.
3. Open this local app at `http://localhost:3300`.
4. Copy the manual sync snippet from the dashboard.
5. Run it on the MegaLog tab to send the visible job table to this app.

## Local API

Health check:

```powershell
Invoke-RestMethod -Uri http://localhost:3300/api/health
```

Latest jobs:

```powershell
Invoke-RestMethod -Uri http://localhost:3300/api/jobs
```

Start the local update heartbeat:

```powershell
Invoke-RestMethod -Uri http://localhost:3300/api/start -Method Post -ContentType 'application/json' -Body '{"interval_minutes":5}'
```

Listen for live events:

```powershell
curl -N http://localhost:3300/api/events
```

Compatibility scrape endpoint:

```powershell
Invoke-RestMethod -Uri http://localhost:3300/api/scrape -Method Post
```

`/api/scrape` does not log in or scrape with a password. It reports the browser-extension sync mode and current saved count.

## Android App Skeleton

Open the `android` folder in Android Studio. The free skeleton app uses the local API and opens selected stops in Google Maps through a normal maps URL, so it does not require a paid Maps SDK key.

For the Android emulator, use:

```text
http://10.0.2.2:3300
```

For a real phone, run:

```powershell
ngrok http 3300
```

Then use the ngrok URL in the Android app. If basic auth is enabled, enter the same username and password in the Android app.

Example response:

```json
{
  "updated_at": "2026-08-17T12:00:00.000Z",
  "captured_at": "2026-08-17T12:00:00.000Z",
  "source": "https://www.jobslingerplus.com/MegaLog",
  "count": 1,
  "jobs": [
    {
      "id": "row-1",
      "title": "Example shop",
      "location": "Example city",
      "pay": "$0.00",
      "due": "Example due date",
      "status": "Example status",
      "fields": {
        "Shop": "Example shop",
        "City": "Example city",
        "Pay": "$0.00",
        "Status": "Example status"
      }
    }
  ]
}
```

## GitHub Safety

Do not commit saved job pages, screenshots with private account details, cookies, sessions, passwords, access tokens, or synced private job data. `.gitignore` keeps local private files out of Git.

```powershell
git init
git add .
git commit -m "Add linked jobs route planner"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USER/YOUR-REPOSITORY.git
git push -u origin main
```
