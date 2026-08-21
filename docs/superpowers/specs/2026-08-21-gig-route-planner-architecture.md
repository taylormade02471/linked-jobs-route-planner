# Gig Route Planner Architecture Specification

> Status: Approved architecture specification. This document is not an implementation patch.

## Goal

Upgrade the existing linked-jobs-route-planner into a private phone-first planner that preserves the desktop app on port 3300, adds a real Capacitor Android shell, stores Android data locally, supports active-use Outlook sync only, ranks jobs intelligently, and opens provider/job/transit actions without tracking secrets.

## Architecture

Keep the desktop Node/static web app working exactly as today. Extract pure shared job, route, provider, and finance logic into platform-free modules. Add platform-specific desktop and Android repositories/services that implement the same contracts. Desktop keeps JSON/cache storage and the existing server. Android uses local SQLite, app-private migration snapshots, native Android share receiving, and a native MSAL/Graph bridge.

## Global Constraints

- Do not store Hotmail, Outlook, Jobslinger, or provider passwords.
- Do not embed unrestricted API keys in source code.
- Do not sync while the application is closed.
- Do not add Android background workers or continuous polling.
- Do not guess provider app package names, deep links, sender domains, or job-ID patterns.
- Do not block the private MVP on optional services like GitHub, Vercel, OpenAI, Google Maps Platform, or cloud database auth.
- Keep desktop JSON/cache storage and port 3300 working.
- Android uses phone-local storage.
- There is no automatic desktop-to-phone data synchronization in the private MVP.
- Cross-device transfer is export/import only in the private MVP.
- Store money as integer cents.
- Store timestamps consistently in UTC, preferably UTC epoch milliseconds for SQLite.
- Keep Outlook tokens native. The WebView/frontend must never receive or store access tokens.
- Keep Capacitor/SQLite/MSAL imports out of pure shared modules.

## Accepted Corrections

### Incoming Shares

Incoming share support must use native Android ACTION_SEND and ACTION_SEND_MULTIPLE. The app must not use wildcard MIME matching such as */*. Supported incoming MIME types for the MVP are:

- text/plain for links and plain text
- image/jpeg for screenshots/photos
- image/png for screenshots/photos
- application/pdf for PDFs
- application/vnd.openxmlformats-officedocument.wordprocessingml.document for DOCX files
- application/msword for legacy DOC files

All incoming share payloads must go to Import Review. Nothing shared is saved automatically.

Capacitor Share, if added, is only for outward sharing/export. It is not the incoming-share mechanism.

### Outlook Synchronization

Inbox delta sync cannot filter by sender, so the MVP must not depend on sender-filtered inbox delta. Outlook sync uses active-use-only minimal metadata scans:

1. Sync when the app opens.
2. Sync when the app returns to the foreground, throttled to a reasonable interval such as five minutes.
3. Sync when the user taps Sync now.
4. Never sync while the app is closed.
5. Never use an Android background worker or continuous polling.

The scan flow is:

1. Use MSAL delegated Microsoft Graph Mail.Read.
2. Request minimal message metadata only.
3. Use a small overlap window plus locally recorded processed message IDs and hashes so messages are not skipped.
4. Discard messages from unapproved senders/domains.
5. Retrieve message bodies only for approved sender messages that look job-related.
6. Normalize, dedupe, reconcile, and save confirmed job data.
7. Sanitize logs so email bodies, tokens, and personal information are not written.

Optional later enhancement: dedicated provider-folder delta sync after folders/rules are verified.

### Native MSAL And Graph Bridge

The Android app requires a native Java or Kotlin Capacitor bridge for MSAL and Graph. Because the current MainActivity is Java, implementation must either:

- use Java plugins, or
- explicitly add Kotlin/Gradle configuration and list android/app/build.gradle among modified files.

The WebView/frontend must never receive or store access tokens. The native bridge exposes safe operations only, such as:

- scanMetadata()
- fetchApprovedMessageBody(messageId)
- signIn()
- signOut()
- getAuthStatus()

The native bridge handles:

- interactive sign-in
- silent token acquisition
- redirect URI handling
- secure MSAL token cache
- Microsoft Graph requests
- token redaction in logs

Required Microsoft permission: delegated Mail.Read only.

### SQLite Storage

Android local data uses versioned SQLite tables. Money fields use integer cents. Timestamps use UTC epoch milliseconds.

Minimum tables:

- schema_meta
- jobs
- job_sources
- requirements
- expenses
- route_sessions
- sync_cursors
- provider_settings
- import_review_records

Before every migration, the app creates an automatic app-private pre-migration snapshot. This internal snapshot is separate from the user-facing encrypted export/import feature.

### Transit Behavior

Keep pure route scoring separate from Node-specific GTFS download/extraction code.

- Pure route scoring may be shared.
- Node filesystem, archive extraction, and HTTP code remain platform-specific.
- Android caches usable transit information locally.
- Label static information as a scheduled estimate.
- Use RideCTS for final real-time verification unless a verified public real-time feed is available.
- Do not embed unrestricted API keys in source code.

### Cross-App Linking

Build a provider registry with verified:

- sender addresses/domains
- website domains
- job-ID patterns
- Android package names
- deep-link formats
- browser fallback URLs

Open Job behavior:

1. Try a verified assignment deep link.
2. If unavailable, copy the job ID and launch the provider app.
3. If the provider app cannot open, use the exact assignment webpage.
4. If only the provider login page is known, open it with the job ID copied.
5. Preserve route progress when returning to the planner.

## Required Authentication

Required for MVP:

- Microsoft OAuth/MSAL app registration for delegated Mail.Read.
- Android location permission.
- Local Android build/install access.
- Transit feed credential only if the selected feed actually requires it.

Not required for private MVP:

- GitHub authentication unless pushing is later authorized.
- Google Maps Platform API key when only opening external Maps directions.
- OpenAI API key.
- Vercel authentication.
- Cloud database credentials.
- Provider passwords for apps opened through links.

## Document Sequence

1. Save this approved architecture under docs/superpowers/specs/.
2. Generate the executable implementation plan under docs/superpowers/plans/.
3. Stop and show the plan before implementation starts.

