# Nashville Live Audit Transit Planner

Isolated planner for the **current Nashville audit set only**. It intentionally does not use old JobSlinger/job-board links or historical provider connections.

## Current work set

- 18 quick photo/tobacco audits supplied in the current planning conversation.
- Requested quick-audit incentive: **$8.50 each**.
- One deliberate 1-hour anchor: **7601 Hwy 70 S**, $38.50, completed first.
- Wednesday service date: **2026-08-26**.

## Phone work app backbone

The Nashville URL now includes a browser-local phone work app layer for:

- Survey Merchandiser
- Clickworker
- Field Nation
- Field Agent

Jobs added, shared, or pasted from those apps are saved in the browser on that device. The planner ranks open available work against the user's current/map location, pay, work time, and verified Nashville planner address matches. Matched open jobs are shown as bright green pins; claimed/assigned jobs are shown as yellow pins.

The Android wrapper can attempt to open installed provider apps by package name. It also accepts `text/plain` Android shares so visible provider job details can be sent into the planner import box for review. This does not scrape private app storage, bypass app security, or copy provider sessions.

Payment-center snapshots can be pasted from visible provider screens and stored locally for field reference. Payment rows are app data only; they are not provider credentials and are not committed.

Email job sync settings are browser-local app data. The first planned mailbox integration is Outlook/Hotmail using Microsoft Graph delegated `Mail.Read` only. The planner stores account labels, sender allowlists, metadata-first preferences, and local sync timestamps. It does not request `Mail.Send`, `Mail.ReadWrite`, passwords, cookies, refresh tokens, or provider credentials. Until OAuth is configured through a registered Microsoft app or native Android MSAL bridge, pasted/shared email text is the safe import path.

Google Cloud OAuth setup has been started for Gmail read-only testing. The public web client ID is recorded in `work-app-backbone.js`; the client secret is intentionally not stored in source, GitHub, Vercel, or browser storage. Gmail API is enabled, the `gmail.readonly` scope is configured, and the app is in Google testing mode for the signed-in Google account. Microsoft Outlook/Hotmail still requires an authenticated Microsoft Azure/Entra portal session before the delegated `Mail.Read` app registration can be created.

The app now also exposes a safe public API registry in the UI so you can see which connection surfaces are public, which are still waiting on registration, and which can support browser-local or native background sync. That registry records only public client IDs and redirect URIs. It never stores passwords, cookies, refresh tokens, or client secrets.

Azure Key Vault is the place to keep the private pieces for selected connections:

- certificates
- keys
- secrets
- API keys

The planner only keeps safe metadata such as vault name, tenant ID, certificate name, and secret reference names. It must not store the private certificate material or secret values in GitHub, Vercel, or browser storage.

The homepage now includes an **Azure Key Vault connection plan** covering every planned connection. It saves only metadata in browser-local app data:

| Connection | Suggested reference names | Actual access required |
| --- | --- | --- |
| Linked Jobs Planner backend | `planner-api-secret`, `planner-api-cert`, `planner-data-key` | Azure-hosted backend identity with least-privilege Key Vault access |
| Survey Merchandiser | `survey-merchandiser-api-key`, `survey-merchandiser-api-ref` | Provider-issued API/OAuth/export flow; otherwise Android share or visible-page intake |
| Clickworker | `clickworker-api-key`, `clickworker-api-ref` | Provider-issued API/OAuth/export flow; otherwise Android share or visible-page intake |
| Field Nation | `field-nation-api-key`, `field-nation-api-ref` | Provider-issued API/OAuth/export flow; otherwise Android share or visible-page intake |
| Field Agent | `field-agent-api-key`, `field-agent-api-ref` | Provider-issued API/OAuth/export flow; otherwise Android share or visible-page intake |
| Outlook / Hotmail | `outlook-mail-read-client-ref` | Microsoft identity app registration and delegated `Mail.Read`; public client uses native MSAL token storage |
| Gmail readonly | `gmail-readonly-client-ref` | Google OAuth verification/testing status; public client session token is not a Key Vault secret |
| Android provider app bridge | No secret, certificate, or key required | Installed app and user-approved `text/plain` share |
| Visible provider page connector | No secret, certificate, or key required | User signs in manually; read visible rows only |

These are reference names, not created Azure objects. To finish the Azure side, create or select the vault in the Azure Portal, create only the planner-owned certificate/key/secret objects, and add provider-specific secret objects only after the provider gives an official API/OAuth credential. A Vercel/browser page cannot directly read Key Vault; an Azure-hosted backend with managed identity or workload identity must be bound before background secret lookup is enabled.

The plan uses the supplied tenant metadata: `Default Directory`, tenant `1befa2db-da34-4cd9-a1d6-d543f8f9c0e5`, primary domain `kyletaylor133hotmail.onmicrosoft.com`, and `Microsoft Entra ID Free`. Subscription ID and final vault name remain blank until selected in Azure.

Provider connection status is also browser-local app data. The planner can remember that a provider is signed in on this device and can reopen that provider's official app/login surface, but it does not store provider passwords, tokens, cookies, MFA codes, or API keys in source code, GitHub, Vercel, or browser storage.

The camera tool requests permission only when the user taps **Start camera**. Captured photos stay in browser storage and can be attached to a phone-app job for field reference. The public Vercel app does not receive provider passwords or log into private phone apps.

Saved phone-app jobs are shared between the homepage and `jobs.html` through the same browser-local key, `nashville_phone_work_jobs_v1`. The homepage stays focused on active route work; the separate **Saved jobs and passed history** page has active, completed/passed, and all-saved views, plus local mark-passed/restore actions and JSON download. Marking a job passed changes only the local planner copy and does not submit or accept work on a provider site.

The Android wrapper uses `https://www.routeplanner.space` as its planner URL and now builds with AndroidX enabled. Its debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk` when building the Android project. `android/local.properties` contains only the local SDK path and is ignored by Git.

## UI

1. **Planned route** — Plan A/B/C/D.
2. **Itinerary section** — numbered from Clarksville -> Nashville forward in actual order; return to Clarksville is a separate RETURN section.
3. **Stop / route view** — starts with **All Stops in Planned Route**, then all stops in the selected section, then individual planned legs.

The map draws only GTFS geometry between the boarding and getting-off stops used by the selected plan. It never draws the entire WeGo line unless the plan actually uses that entire segment.

## Static + live data

- Static route geometry, stop names/IDs, and Wednesday schedule estimates come from the supplied `google_transit.zip`.
- `/api/wego-live` proxies WeGo's official GTFS-Realtime vehicle, trip-update, and alert feeds server-side.
- Frontend refresh interval: **30 seconds**.
- If live data fails, the static Wednesday route remains usable and the UI does not silently substitute an old GPS snapshot.
- Browser geolocation is enabled in the planner. The page can request phone location permission, continuously update a **YOU ARE HERE** marker, show accuracy, and center the map on the user.
- Camera capture is enabled for local job-card/reference photos when the browser or Android wrapper grants camera permission.
- Network access is required for the map tiles and `/api/wego-live` GTFS-Realtime proxy.

Official WeGo realtime endpoints: https://www.wegotransit.com/contact-us/data-request-submission/

## Vercel

Create a Vercel project with this folder (`nashville-live-planner`) as the project root. No Google API key is required for the planner itself. Leaflet/OpenStreetMap is used for the map; WeGo GTFS/GTFS-Realtime supplies transit truth.

## Important field constraint

Route 94 Wednesday GTFS used here:
- Clarksville Exit 11 -> Nashville Central: **5:48 AM -> 6:35 AM**
- Last planned Nashville Central -> Clarksville Exit 11: **5:10 PM -> 6:06 PM**

`3721 Clarksville Hwy` is not treated as a direct Route 22 stop. The planner correctly marks the Bordeaux last-mile as **WeGo Link required** from a designated transfer point rather than inventing a fixed-route stop.

## Deployment trigger

Location-enabled field build confirmed in source on 2026-08-25. This commit intentionally triggers the connected Vercel Git deployment.
