# Browser Extension

This extension reads visible rows from the main Jobslinger page and syncs them to the local route planner.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Choose this `browser-extension` folder

## What it does

- Watches the page for updates
- Scrapes visible table rows
- Posts them to `http://127.0.0.1:3300/api/jobs`

## Notes

- Keep the local dashboard open at `http://localhost:3300/`
- If the page uses different table columns or a different layout, the selector logic in `content.js` may need a small update

