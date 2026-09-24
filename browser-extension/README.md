# Browser Extension

This extension reads visible rows from supported signed-in job board pages and syncs them to the local route planner.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Choose this `browser-extension` folder

## What it does

- Watches supported board pages for updates
- Scrapes visible table rows or job cards
- Posts them to `http://127.0.0.1:3300/api/jobs`

Supported boards:

- Jobslinger MegaLog
- Survey Merchandiser
- Clickworker
- Field Nation
- Field Agent

## Notes

- Keep the local dashboard open at `http://localhost:3300/`
- Save the board in the planner after you log in locally
- If a board uses different table columns or a different layout, the selector logic in `content.js` may need a small update
