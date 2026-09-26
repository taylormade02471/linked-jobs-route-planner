# Browser Extension

This extension reads visible job cards from the signed-in JobSlinger MegaLog page and syncs safe job fields to the existing local route planner.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Choose this `browser-extension` folder

## What it does

- Watches the MegaLog page for added or changed job cards
- Extracts the address, pay, due date, status, instructions, and verified details link
- Posts only safe job fields to `http://127.0.0.1:3300/api/provider-jobs`
- Checks immediately after a page change and every 30 minutes while MegaLog remains open

## Notes

- Keep the local server running at `http://127.0.0.1:3300/`
- Sign in to JobSlinger yourself and keep `https://www.jobslingerplus.com/MegaLog` open
- The extension never reads or sends passwords, cookies, session tokens, or MFA codes
- In `chrome://extensions`, press **Reload** for this extension after updating these files

