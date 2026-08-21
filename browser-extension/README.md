# Live Jobslinger Sync Extension

This extension is the automatic active-use data transfer path for Jobslinger/MegaLog. It reads visible MegaLog jobs from your already signed-in Chrome tab and syncs them to the local route planner. The manual MegaLog importer is only a backup tool, not the main workflow.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Choose this `browser-extension` folder

## What it does

- Watches the page for updates
- Scrapes visible table rows
- Posts them to `http://127.0.0.1:3300/api/jobs`
- Updates the route planner source status so the dashboard can show that live extension sync is connected

## Notes

- Keep the local dashboard open at `http://localhost:3300/`
- Keep the signed-in Jobslinger MegaLog page open in Chrome
- If the page uses different table columns or a different layout, the selector logic in `content.js` may need a small update
