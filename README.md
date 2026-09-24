# Linked Jobs Route Planner

This repository is a separate route-planner app for linked job data.

It is not the Shopify project.

## What it does

- Uses a local dashboard login that lasts 7 days
- Lets you link one or more supported job boards after local login
- Keeps live job data coming in from signed-in board tabs, the browser extension, or shared text intake
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

After you sign in to the local planner, open the **Link job boards and auto-feed work** section to choose which supported boards you want to connect and save the board details you want stored locally.

The browser extension now posts visible job rows from supported signed-in job boards to:

- `POST /api/jobs`
- `POST /api/shared-jobs`

`/api/jobs` stays open for the local extension so the app does not depend on keeping the planner tab active. `/api/shared-jobs` lets you paste shared rows or JSON when a board works better through copy/share than through a visible page connector.
The extension also polls on a timer, so updates keep flowing even when the page does not mutate.

The Jobslinger login page includes a square-click challenge, so the reliable flow is:

1. Log in on the supported job board page in Chrome
2. Load the unpacked extension
3. Save the board in the planner after local login
4. Keep the route planner running and the extension will stream visible rows into it

## Save linked board info

Use the dashboard’s **Link job boards and auto-feed work** section after local login.

- Choose the supported boards you want linked
- Save each board’s login URL, username, optional local password, and notes
- The data is written only to the ignored backend data folder
- Passwords are stored encrypted at rest and never shown back in the UI
- Use the share/parse intake when a board is easier to copy or share than to leave open in a browser tab

## Install the browser extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the [`browser-extension`](browser-extension) folder from this repository
5. Open one of the supported signed-in board pages in the browser and keep the dashboard running at `http://localhost:3300/`

If the page layout changes, the extension may need selector tweaks, but it will stay live as long as the page is open and the local route planner is running.

## API

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/linked-boards`
- `POST /api/linked-boards`
- `POST /api/shared-jobs`
- `GET /api/events`
- `POST /api/start`
- `POST /api/scrape`

## Android

The `android/` folder is a starter WebView app that loads the local route-planner UI.
