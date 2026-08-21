# Gig Route Planner Capacitor Outlook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing linked-jobs-route-planner into a private desktop-preserving, Android-local, active-use-sync route planner without leaking credentials or Outlook tokens.

**Architecture:** Desktop remains a Node/static app on port 3300 with JSON/cache storage. Shared job, provider, finance, and route logic becomes platform-free. Android becomes a real Capacitor app with local SQLite, native ACTION_SEND receiving, native MSAL/Graph operations, and foreground-only Outlook synchronization.

**Tech Stack:** Node.js, plain browser frontend, Capacitor Android, Java or explicitly configured Kotlin, Android MSAL, Microsoft Graph Mail.Read, SQLite via Capacitor/community bridge, Leaflet/OpenStreetMap, Node test runner or Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-gig-route-planner-architecture.md`

## Global Constraints

- Do not edit application code until this plan is approved.
- Keep desktop operation on port 3300.
- Do not add automatic desktop-to-phone synchronization.
- Do not run Android background workers or closed-app polling.
- Keep Outlook tokens native; WebView/frontend must never receive or store access tokens.
- Native MSAL/Graph bridge exposes safe operations such as `scanMetadata()` and `fetchApprovedMessageBody(messageId)`.
- Avoid skipped emails by using a small overlap window plus processed message IDs/hashes, not only one timestamp cursor.
- Current `MainActivity` is Java; use Java plugins or explicitly add Kotlin/Gradle configuration and list `android/app/build.gradle` among modified files.
- Incoming shares use native `ACTION_SEND` and `ACTION_SEND_MULTIPLE`; `@capacitor/share` is only for outward sharing.
- Supported incoming MIME types are `text/plain`, `image/jpeg`, `image/png`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, and `application/msword`.
- Do not use wildcard MIME type `*/*`.
- Store money as integer cents.
- Store timestamps as UTC epoch milliseconds.
- Create automatic app-private pre-migration snapshots before migrations.
- Keep user-facing encrypted export/import separate from migration snapshots.
- Keep pure shared modules free of Capacitor, SQLite, Android, filesystem, and MSAL imports.
- Do not embed unrestricted API keys, credentials, email bodies, tokens, or personal data in logs or tracked files.

---

## File Map

### Existing Files Changed

- `package.json`: add test scripts and dependencies only when the tests/tasks require them.
- `backend/server.js`: keep desktop behavior and move reusable logic calls behind interfaces.
- `backend/server_live.js`: preserve desktop entrypoint.
- `backend/transitland.js`: keep Node-only GTFS download/extract/cache; move scoring out.
- `frontend/index.html`: reuse in Capacitor shell and add Import Review/map entry points.
- `frontend/app.js`: call service interfaces and stop owning pure domain logic.
- `frontend/styles.css`: phone-size layout and route/map panel refinements.
- `android/build.gradle`: only modify if Capacitor or Kotlin setup requires it.
- `android/app/build.gradle`: add Capacitor, SQLite, MSAL, and Kotlin config if Kotlin is chosen.
- `android/app/src/main/AndroidManifest.xml`: add exact permissions and exact MIME intent filters.
- `android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java`: register native plugins or migrate to Kotlin only if explicitly configured.
- `.gitignore`: ignore local DBs, token caches, app-private exports, runtime snapshots, `.env`, and `android/.idea/`.
- `README.md`: document desktop, Android, active-use sync, secrets, backup/import, and verification.

### New Shared Files

- `shared/domain/jobSchema.js`
- `shared/domain/jobNormalize.js`
- `shared/domain/dedupe.js`
- `shared/domain/reconcile.js`
- `shared/domain/priority.js`
- `shared/domain/routeScore.js`
- `shared/domain/finance.js`
- `shared/domain/providers.js`
- `shared/contracts/repositories.js`
- `shared/contracts/services.js`

### New Desktop Platform Files

- `platform/desktop/jobRepository.js`
- `platform/desktop/transitSource.js`
- `platform/desktop/exportImportService.js`

### New Android Platform Files

- `platform/android/storage/schema.js`
- `platform/android/storage/migrations.js`
- `platform/android/storage/sqliteJobRepository.js`
- `platform/android/import/importReviewService.js`
- `platform/android/app-links/providerRegistry.js`
- `platform/android/app-links/openJobService.js`
- `platform/android/outlook/outlookSyncService.js`
- `platform/android/outlook/outlookMetadataScanner.js`
- `platform/android/outlook/outlookBodyFetcher.js`
- `platform/android/auth/msalAuthService.js`

### New Native Android Files

Use Java by default because the current `MainActivity` is Java:

- `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalAuthPlugin.java`
- `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalGraphBridge.java`
- `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalAuthStatus.java`
- `android/app/src/main/java/com/linkedjobs/routeplanner/share/ShareIntentPlugin.java`
- `android/app/src/main/java/com/linkedjobs/routeplanner/share/SharedPayload.java`
- `android/app/src/main/res/raw/msal_config.json`

If Kotlin is chosen instead, add these files and explicitly modify Gradle:

- `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalAuthPlugin.kt`
- `android/app/src/main/java/com/linkedjobs/routeplanner/share/ShareIntentPlugin.kt`
- `android/build.gradle`
- `android/app/build.gradle`

### New Tests

- `tests/domain/jobSchema.test.js`
- `tests/domain/jobNormalize.test.js`
- `tests/domain/dedupe.test.js`
- `tests/domain/reconcile.test.js`
- `tests/domain/priority.test.js`
- `tests/domain/routeScore.test.js`
- `tests/domain/finance.test.js`
- `tests/platform/desktop/server.test.js`
- `tests/platform/android/storage/migrations.test.js`
- `tests/platform/android/outlook/outlookSyncService.test.js`
- `tests/platform/android/import/importReviewService.test.js`
- `tests/platform/android/app-links/openJobService.test.js`

---

## Repository And Service Interfaces

```js
// shared/contracts/repositories.js
export class JobRepository {
  async listJobs(filter = {}) { throw new Error("Not implemented"); }
  async getJob(jobId) { throw new Error("Not implemented"); }
  async upsertJobs(jobs, source) { throw new Error("Not implemented"); }
  async updateJobStatus(jobId, status, metadata = {}) { throw new Error("Not implemented"); }
  async saveRequirement(jobId, requirement) { throw new Error("Not implemented"); }
  async listRouteSessions(filter = {}) { throw new Error("Not implemented"); }
  async saveRouteSession(session) { throw new Error("Not implemented"); }
  async getSyncCursor(sourceId) { throw new Error("Not implemented"); }
  async saveSyncCursor(sourceId, cursor) { throw new Error("Not implemented"); }
}

export class TransitRepository {
  async getStopsNear(location, radiusMeters) { throw new Error("Not implemented"); }
  async getRoutesForStop(stopId) { throw new Error("Not implemented"); }
  async saveTransitSnapshot(snapshot) { throw new Error("Not implemented"); }
}

export class ProviderSettingsRepository {
  async listProviders() { throw new Error("Not implemented"); }
  async getProvider(providerId) { throw new Error("Not implemented"); }
  async saveProvider(provider) { throw new Error("Not implemented"); }
}
```

```js
// shared/contracts/services.js
export class OutlookSyncService {
  async syncOnOpen(nowUtcMs) { throw new Error("Not implemented"); }
  async syncOnForeground(nowUtcMs) { throw new Error("Not implemented"); }
  async syncNow(nowUtcMs) { throw new Error("Not implemented"); }
}

export class NativeGraphBridge {
  async scanMetadata({ sinceUtcMs, overlapMinutes }) { throw new Error("Not implemented"); }
  async fetchApprovedMessageBody(messageId) { throw new Error("Not implemented"); }
  async getAuthStatus() { throw new Error("Not implemented"); }
}

export class RoutePlanningService {
  async buildCandidates({ origin, jobs, transitSnapshot, nowUtcMs }) { throw new Error("Not implemented"); }
  async chooseRoute({ origin, selectedCandidate }) { throw new Error("Not implemented"); }
}

export class OpenJobService {
  async openJob(job) { throw new Error("Not implemented"); }
}

export class ImportReviewService {
  async createReviewItem(sharedPayload) { throw new Error("Not implemented"); }
  async approveImport(reviewId) { throw new Error("Not implemented"); }
  async rejectImport(reviewId) { throw new Error("Not implemented"); }
}
```

---

## Database Schema

```sql
CREATE TABLE schema_meta (
  version INTEGER PRIMARY KEY,
  applied_at_utc_ms INTEGER NOT NULL,
  snapshot_path TEXT,
  rollback_available INTEGER NOT NULL
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  source_job_id TEXT,
  title TEXT NOT NULL,
  survey TEXT,
  address1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat REAL,
  lng REAL,
  due_at_utc_ms INTEGER,
  submit_due_at_utc_ms INTEGER,
  do_not_shop_before_utc_ms INTEGER,
  status TEXT NOT NULL,
  pay_cents INTEGER NOT NULL DEFAULT 0,
  bonus_cents INTEGER NOT NULL DEFAULT 0,
  expenses_cap_cents INTEGER NOT NULL DEFAULT 0,
  special_expenses_cap_cents INTEGER NOT NULL DEFAULT 0,
  details_url TEXT,
  raw_source_id TEXT,
  priority_score INTEGER NOT NULL DEFAULT 0,
  created_at_utc_ms INTEGER NOT NULL,
  updated_at_utc_ms INTEGER NOT NULL
);

CREATE TABLE job_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  provider_id TEXT,
  external_id TEXT,
  captured_at_utc_ms INTEGER NOT NULL,
  sanitized_excerpt TEXT,
  hash TEXT NOT NULL
);

CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at_utc_ms INTEGER NOT NULL,
  updated_at_utc_ms INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reimbursable INTEGER NOT NULL DEFAULT 0,
  receipt_uri TEXT,
  created_at_utc_ms INTEGER NOT NULL,
  updated_at_utc_ms INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE TABLE route_sessions (
  id TEXT PRIMARY KEY,
  started_at_utc_ms INTEGER NOT NULL,
  completed_at_utc_ms INTEGER,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  status TEXT NOT NULL,
  selected_job_ids_json TEXT NOT NULL,
  planned_order_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  freshness_label TEXT NOT NULL
);

CREATE TABLE sync_cursors (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  provider_id TEXT,
  last_scan_start_utc_ms INTEGER,
  last_sync_at_utc_ms INTEGER,
  last_success_at_utc_ms INTEGER,
  processed_message_ids_json TEXT NOT NULL DEFAULT '[]',
  processed_hashes_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE provider_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sender_domains_json TEXT NOT NULL DEFAULT '[]',
  website_domains_json TEXT NOT NULL DEFAULT '[]',
  job_id_patterns_json TEXT NOT NULL DEFAULT '[]',
  android_packages_json TEXT NOT NULL DEFAULT '[]',
  deep_links_json TEXT NOT NULL DEFAULT '[]',
  fallback_urls_json TEXT NOT NULL DEFAULT '[]',
  verified_at_utc_ms INTEGER
);

CREATE TABLE import_review_records (
  id TEXT PRIMARY KEY,
  payload_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  payload_uri TEXT,
  payload_text TEXT,
  detected_provider_id TEXT,
  detected_job_id TEXT,
  status TEXT NOT NULL,
  created_at_utc_ms INTEGER NOT NULL,
  reviewed_at_utc_ms INTEGER
);
```

Migration behavior:

- Before applying migration N, create an app-private snapshot named `migration-v{current}-to-v{target}-{utcMs}.db`.
- If migration N fails, restore from that snapshot and keep the failed migration unapplied.
- User-facing encrypted export/import is not used for migration rollback.

---

## Task 1: Baseline Safety And Test Harness

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tests/platform/desktop/server.test.js`
- Create: `tests/domain/testFixtures.js`

**Interfaces:**
- Consumes: existing desktop `backend/server_live.js` and `backend/server.js`.
- Produces: repeatable tests for desktop health/jobs behavior and secret ignore rules.

- [ ] **Step 1: Write failing desktop regression tests**

```js
// tests/platform/desktop/server.test.js
import test from "node:test";
import assert from "node:assert/strict";

test("desktop server module does not start live browser polling on import", async () => {
  const serverSource = await import("node:fs/promises").then(fs => fs.readFile("backend/server.js", "utf8"));
  assert.equal(serverSource.includes("startLivePolling();"), false);
});

test("desktop entrypoint remains server_live.js", async () => {
  const pkg = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile("backend/package.json", "utf8")));
  assert.equal(pkg.main, "server_live.js");
});
```

- [ ] **Step 2: Run test to verify it fails or exposes missing test script**

Run: `npm test`

Expected: FAIL if no test script exists, or PASS/FAIL based on current code. If the failure is "Missing script: test", continue to Step 3.

- [ ] **Step 3: Add minimal test script**

```json
{
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  }
}
```

- [ ] **Step 4: Update ignored runtime files**

Ensure `.gitignore` includes:

```gitignore
.env
.env.*
*.db
*.sqlite
*.sqlite3
*.db-shm
*.db-wal
android/.idea/
android/app/src/main/res/raw/msal_config.local.json
data/runtime/
data/token-cache/
data/migration-snapshots/
outputs/private-exports/
```

- [ ] **Step 5: Run baseline tests**

Run: `npm test`

Expected: PASS for baseline tests.

- [ ] **Rollback point**

Rollback: `git restore package.json .gitignore tests/platform/desktop/server.test.js tests/domain/testFixtures.js`

- [ ] **Commit checkpoint**

```bash
git add package.json .gitignore tests/platform/desktop/server.test.js tests/domain/testFixtures.js
git commit -m "test: add route planner baseline safety checks"
```

---

## Task 2: Shared Domain Foundation

**Files:**
- Create: `shared/domain/jobSchema.js`
- Create: `shared/domain/jobNormalize.js`
- Create: `shared/domain/dedupe.js`
- Create: `shared/domain/reconcile.js`
- Create: `shared/domain/priority.js`
- Create: `shared/domain/finance.js`
- Create: `tests/domain/jobSchema.test.js`
- Create: `tests/domain/jobNormalize.test.js`
- Create: `tests/domain/dedupe.test.js`
- Create: `tests/domain/reconcile.test.js`
- Create: `tests/domain/priority.test.js`
- Create: `tests/domain/finance.test.js`

**Interfaces:**
- Produces: `validateJob(job)`, `normalizeMoneyToCents(value)`, `normalizeUtcMs(value)`, `normalizeMegaLogJob(raw)`, `makeJobFingerprint(job)`, `reconcileStatus(local, incoming)`, `scoreJobPriority(job, nowUtcMs)`, `calculateJobFinancials(job, expenses)`.
- Consumes: no platform imports.

- [ ] **Step 1: Write failing schema and money tests**

```js
// tests/domain/jobSchema.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMoneyToCents, normalizeUtcMs, validateJob } from "../../shared/domain/jobSchema.js";

test("money is normalized to integer cents", () => {
  assert.equal(normalizeMoneyToCents("16.00"), 1600);
  assert.equal(normalizeMoneyToCents("$120"), 12000);
  assert.equal(normalizeMoneyToCents(null), 0);
});

test("timestamps normalize to UTC epoch milliseconds", () => {
  assert.equal(normalizeUtcMs("2026-08-21T12:00:00.000Z"), 1787313600000);
});

test("job validation rejects non-cent money field names", () => {
  assert.throws(() => validateJob({ id: "1", title: "A", pay: 16 }), /pay_cents/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/domain/jobSchema.test.js`

Expected: FAIL with module not found for `shared/domain/jobSchema.js`.

- [ ] **Step 3: Implement schema helpers**

Create `shared/domain/jobSchema.js` with the exported helpers named in Step 1. Use only standard JavaScript.

- [ ] **Step 4: Write failing priority tests**

```js
// tests/domain/priority.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { scoreJobPriority } from "../../shared/domain/priority.js";

const now = Date.parse("2026-08-21T14:00:00.000Z");

test("overdue jobs outrank today, tomorrow, and later jobs", () => {
  const overdue = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-20T23:00:00.000Z") }, now);
  const today = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-21T23:00:00.000Z") }, now);
  const tomorrow = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-22T23:00:00.000Z") }, now);
  const later = scoreJobPriority({ due_at_utc_ms: Date.parse("2026-08-30T23:00:00.000Z") }, now);
  assert.ok(overdue > today);
  assert.ok(today > tomorrow);
  assert.ok(tomorrow > later);
});
```

- [ ] **Step 5: Implement priority, normalization, dedupe, reconcile, and finance modules**

Implement the named exports. Keep the modules platform-free. Do not import Capacitor, SQLite, Android, Node filesystem, Playwright, or MSAL.

- [ ] **Step 6: Run domain tests**

Run: `npm test -- tests/domain/*.test.js`

Expected: PASS.

- [ ] **Rollback point**

Rollback: `git restore shared/domain tests/domain`

- [ ] **Commit checkpoint**

```bash
git add shared/domain tests/domain
git commit -m "feat: add shared job domain foundation"
```

---

## Task 3: Shared Route And Contract Interfaces

**Files:**
- Create: `shared/domain/routeScore.js`
- Create: `shared/domain/providers.js`
- Create: `shared/contracts/repositories.js`
- Create: `shared/contracts/services.js`
- Create: `tests/domain/routeScore.test.js`

**Interfaces:**
- Produces: repository/service base classes from this plan and `scoreRouteCandidate({ job, origin, transit, nowUtcMs })`.
- Consumes: `scoreJobPriority(job, nowUtcMs)`.

- [ ] **Step 1: Write failing route scoring test**

```js
// tests/domain/routeScore.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { scoreRouteCandidate } from "../../shared/domain/routeScore.js";

test("route score favors urgent jobs with lower walking burden and transit access", () => {
  const nowUtcMs = Date.parse("2026-08-21T14:00:00.000Z");
  const urgentNearTransit = scoreRouteCandidate({
    nowUtcMs,
    origin: { lat: 36.53, lng: -87.35 },
    job: { due_at_utc_ms: Date.parse("2026-08-21T22:00:00.000Z"), pay_cents: 1600 },
    transit: { nearestStopMeters: 150, walkingMeters: 500, scheduledConfidence: "scheduled-estimate" }
  });
  const laterLongWalk = scoreRouteCandidate({
    nowUtcMs,
    origin: { lat: 36.53, lng: -87.35 },
    job: { due_at_utc_ms: Date.parse("2026-08-28T22:00:00.000Z"), pay_cents: 1600 },
    transit: { nearestStopMeters: 1200, walkingMeters: 3000, scheduledConfidence: "scheduled-estimate" }
  });
  assert.ok(urgentNearTransit.total > laterLongWalk.total);
  assert.equal(urgentNearTransit.freshness_label, "scheduled estimate");
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/domain/routeScore.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement route score and contracts**

Implement `shared/domain/routeScore.js`, `shared/domain/providers.js`, `shared/contracts/repositories.js`, and `shared/contracts/services.js` exactly using the interfaces listed above.

- [ ] **Step 4: Run route/domain tests**

Run: `npm test -- tests/domain/*.test.js`

Expected: PASS.

- [ ] **Rollback point**

Rollback: `git restore shared/domain/routeScore.js shared/domain/providers.js shared/contracts tests/domain/routeScore.test.js`

- [ ] **Commit checkpoint**

```bash
git add shared/domain/routeScore.js shared/domain/providers.js shared/contracts tests/domain/routeScore.test.js
git commit -m "feat: add shared route scoring contracts"
```

---

## Task 4: Preserve Desktop With Platform Adapters

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/transitland.js`
- Create: `platform/desktop/jobRepository.js`
- Create: `platform/desktop/transitSource.js`
- Create: `platform/desktop/exportImportService.js`
- Modify: `tests/platform/desktop/server.test.js`

**Interfaces:**
- Consumes: shared contracts and domain modules.
- Produces: desktop adapters that keep current JSON/cache behavior.

- [ ] **Step 1: Add failing desktop adapter tests**

```js
// tests/platform/desktop/server.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { DesktopJobRepository } from "../../../platform/desktop/jobRepository.js";

test("desktop repository upserts and lists normalized jobs", async () => {
  const repo = new DesktopJobRepository({ storagePath: "data/test-jobs.json" });
  await repo.upsertJobs([{ id: "job-1", title: "Test", status: "available", pay_cents: 1600, created_at_utc_ms: 1, updated_at_utc_ms: 1 }], { type: "test" });
  const jobs = await repo.listJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].pay_cents, 1600);
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/platform/desktop/server.test.js`

Expected: FAIL with module not found for `platform/desktop/jobRepository.js`.

- [ ] **Step 3: Implement desktop adapters without changing API behavior**

Implement adapters and wire `backend/server.js` only through adapter calls. Preserve existing endpoint paths such as `/api/health`, `/api/jobs`, `/api/scrape`, `/api/start`, `/api/events`, and existing port behavior.

- [ ] **Step 4: Run desktop tests**

Run: `npm test -- tests/platform/desktop/server.test.js`

Expected: PASS.

- [ ] **Step 5: Smoke test desktop server**

Run: `npm start`

Expected: server prints that it is listening on port 3300. Stop it with Ctrl+C after verifying.

- [ ] **Rollback point**

Rollback: `git restore backend/server.js backend/transitland.js platform/desktop tests/platform/desktop/server.test.js`

- [ ] **Commit checkpoint**

```bash
git add backend/server.js backend/transitland.js platform/desktop tests/platform/desktop/server.test.js
git commit -m "refactor: preserve desktop through platform adapters"
```

---

## Task 5: Capacitor Android Shell

**Files:**
- Modify: `package.json`
- Modify: `android/build.gradle`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java`
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`

**Interfaces:**
- Consumes: existing frontend.
- Produces: real Capacitor shell with lifecycle and geolocation availability.

- [ ] **Step 1: Add dependency and shell acceptance notes to tests**

Add a test or documented check that Android builds with `gradlew assembleDebug` after Capacitor configuration.

- [ ] **Step 2: Install Capacitor dependencies**

Run: `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/geolocation @capacitor/browser`

Expected: dependencies are added to `package.json` and lockfile.

- [ ] **Step 3: Configure Android shell**

Keep Java unless Kotlin is explicitly chosen. If Java is used, do not add Kotlin config. If Kotlin is chosen, modify `android/build.gradle` and `android/app/build.gradle` and list the Kotlin plugin/version in the commit message.

- [ ] **Step 4: Add Android permissions**

Manifest permissions must include:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

- [ ] **Step 5: Build Android**

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Rollback point**

Rollback: `git restore package.json package-lock.json android frontend`

- [ ] **Commit checkpoint**

```bash
git add package.json package-lock.json android frontend
git commit -m "feat: add capacitor android shell"
```

---

## Task 6: Android SQLite Storage And Migrations

**Files:**
- Modify: `package.json`
- Create: `platform/android/storage/schema.js`
- Create: `platform/android/storage/migrations.js`
- Create: `platform/android/storage/sqliteJobRepository.js`
- Create: `tests/platform/android/storage/migrations.test.js`

**Interfaces:**
- Consumes: `JobRepository` contract.
- Produces: SQLite repository and migration runner with automatic app-private snapshots.

- [ ] **Step 1: Write failing migration tests**

```js
// tests/platform/android/storage/migrations.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildSchemaV1, planMigration } from "../../../../platform/android/storage/migrations.js";

test("schema stores money as cents and timestamps as UTC milliseconds", () => {
  const schema = buildSchemaV1().join("\n");
  assert.match(schema, /pay_cents INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /created_at_utc_ms INTEGER NOT NULL/);
  assert.doesNotMatch(schema, /\bpay REAL\b/);
});

test("migration plan creates app-private snapshot before applying migration", () => {
  const plan = planMigration({ currentVersion: 0, targetVersion: 1, nowUtcMs: 1787313600000 });
  assert.equal(plan[0].type, "create_app_private_snapshot");
  assert.equal(plan[1].type, "apply_schema_version");
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/platform/android/storage/migrations.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Install SQLite dependency**

Run: `npm install @capacitor-community/sqlite`

Expected: dependency added.

- [ ] **Step 4: Implement schema and migrations**

Implement schema exactly from the database schema section. Add `buildSchemaV1()`, `planMigration()`, `createPreMigrationSnapshot()`, `applyMigration()`, and `rollbackFromSnapshot()`.

- [ ] **Step 5: Run tests and Android build**

Run: `npm test -- tests/platform/android/storage/migrations.test.js`

Expected: PASS.

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Rollback point**

Rollback: `git restore package.json package-lock.json platform/android/storage tests/platform/android/storage android`

- [ ] **Commit checkpoint**

```bash
git add package.json package-lock.json platform/android/storage tests/platform/android/storage android
git commit -m "feat: add android sqlite migrations"
```

---

## Task 7: Native Incoming Share And Import Review

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java`
- Create: `android/app/src/main/java/com/linkedjobs/routeplanner/share/ShareIntentPlugin.java`
- Create: `android/app/src/main/java/com/linkedjobs/routeplanner/share/SharedPayload.java`
- Create: `platform/android/import/importReviewService.js`
- Create: `tests/platform/android/import/importReviewService.test.js`
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`

**Interfaces:**
- Produces: `ShareIntentPlugin.getPendingShare()`, `ShareIntentPlugin.clearPendingShare()`, `ImportReviewService.createReviewItem(sharedPayload)`.
- Consumes: native Android ACTION_SEND payloads.

- [ ] **Step 1: Write failing Import Review tests**

```js
// tests/platform/android/import/importReviewService.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSharedPayload } from "../../../../platform/android/import/importReviewService.js";

test("plain links arrive as text/plain and are held for review", () => {
  const item = normalizeSharedPayload({ mimeType: "text/plain", text: "https://www.jobslingerplus.com/MegaLog" });
  assert.equal(item.status, "needs_review");
  assert.equal(item.mime_type, "text/plain");
});

test("wildcard mime type is rejected", () => {
  assert.throws(() => normalizeSharedPayload({ mimeType: "*/*", text: "bad" }), /Unsupported MIME type/);
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/platform/android/import/importReviewService.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Add exact native intent filters**

Manifest must include ACTION_SEND and ACTION_SEND_MULTIPLE filters for these exact MIME types only:

```xml
<data android:mimeType="text/plain" />
<data android:mimeType="image/jpeg" />
<data android:mimeType="image/png" />
<data android:mimeType="application/pdf" />
<data android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
<data android:mimeType="application/msword" />
```

- [ ] **Step 4: Implement Java share plugin**

Implement Java plugin classes. Do not use `@capacitor/share` for receiving.

- [ ] **Step 5: Run tests and Android build**

Run: `npm test -- tests/platform/android/import/importReviewService.test.js`

Expected: PASS.

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Rollback point**

Rollback: `git restore android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java android/app/src/main/java/com/linkedjobs/routeplanner/share platform/android/import tests/platform/android/import frontend`

- [ ] **Commit checkpoint**

```bash
git add android platform/android/import tests/platform/android/import frontend
git commit -m "feat: add native incoming share review"
```

---

## Task 8: Provider Registry And Open Job Fallbacks

**Files:**
- Create: `platform/android/app-links/providerRegistry.js`
- Create: `platform/android/app-links/openJobService.js`
- Create: `tests/platform/android/app-links/openJobService.test.js`
- Modify: `frontend/app.js`

**Interfaces:**
- Produces: `openJob(job)` fallback order.
- Consumes: verified provider registry entries.

- [ ] **Step 1: Write failing fallback-order test**

```js
// tests/platform/android/app-links/openJobService.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenJobActions } from "../../../../platform/android/app-links/openJobService.js";

test("open job uses verified deep link, app launch with copied id, exact webpage, then login fallback", () => {
  const actions = buildOpenJobActions({
    id: "job-123",
    source_job_id: "ABC123",
    details_url: "https://provider.example/jobs/ABC123"
  }, {
    verifiedDeepLink: "provider://jobs/ABC123",
    packageName: "com.example.provider",
    loginUrl: "https://provider.example/login"
  });
  assert.deepEqual(actions.map(a => a.type), ["deep_link", "copy_job_id_and_open_app", "browser_exact", "copy_job_id_and_login"]);
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/platform/android/app-links/openJobService.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement provider registry with no guessed values**

Initial registry may include empty arrays for unverified providers. Do not add package names or deep links until verified.

- [ ] **Step 4: Implement open action builder**

The action builder must preserve route progress state before launching an external app/browser.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/platform/android/app-links/openJobService.test.js`

Expected: PASS.

- [ ] **Rollback point**

Rollback: `git restore platform/android/app-links tests/platform/android/app-links frontend/app.js`

- [ ] **Commit checkpoint**

```bash
git add platform/android/app-links tests/platform/android/app-links frontend/app.js
git commit -m "feat: add provider open job fallbacks"
```

---

## Task 9: Native MSAL And Safe Graph Bridge

**Files:**
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java`
- Create: `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalAuthPlugin.java`
- Create: `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalGraphBridge.java`
- Create: `android/app/src/main/java/com/linkedjobs/routeplanner/auth/MsalAuthStatus.java`
- Create: `android/app/src/main/res/raw/msal_config.json`
- Create: `platform/android/auth/msalAuthService.js`

**Interfaces:**
- Produces native-safe operations: `signIn()`, `signOut()`, `getAuthStatus()`, `scanMetadata()`, `fetchApprovedMessageBody(messageId)`.
- Consumes: Microsoft app registration with delegated `Mail.Read`.

- [ ] **Step 1: Add native MSAL dependency**

Modify `android/app/build.gradle` to include the Android MSAL dependency. Keep Java plugin implementation unless Kotlin is deliberately configured.

- [ ] **Step 2: Add MSAL config template**

Create `android/app/src/main/res/raw/msal_config.json` with non-secret configuration placeholders:

```json
{
  "client_id": "REPLACE_WITH_MICROSOFT_APP_CLIENT_ID",
  "redirect_uri": "msauth://REPLACE_WITH_ANDROID_PACKAGE/REPLACE_WITH_SIGNATURE_HASH",
  "account_mode": "SINGLE",
  "broker_redirect_uri_registered": false,
  "authorities": [
    {
      "type": "AAD",
      "audience": {
        "type": "AzureADandPersonalMicrosoftAccount"
      }
    }
  ]
}
```

- [ ] **Step 3: Implement native bridge without exposing tokens to WebView**

The bridge returns job-safe data objects and status. It must not return access tokens, refresh tokens, raw email bodies to logs, or token-cache paths to JavaScript.

- [ ] **Step 4: Build Android**

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Rollback point**

Rollback: `git restore android/app/build.gradle android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/linkedjobs/routeplanner/MainActivity.java android/app/src/main/java/com/linkedjobs/routeplanner/auth android/app/src/main/res/raw/msal_config.json platform/android/auth`

- [ ] **Commit checkpoint**

```bash
git add android/app/build.gradle android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/linkedjobs/routeplanner android/app/src/main/res/raw/msal_config.json platform/android/auth
git commit -m "feat: add native msal graph bridge"
```

---

## Task 10: Outlook Active-Use Metadata Scan

**Files:**
- Create: `platform/android/outlook/outlookMetadataScanner.js`
- Create: `platform/android/outlook/outlookBodyFetcher.js`
- Create: `platform/android/outlook/outlookSyncService.js`
- Create: `tests/platform/android/outlook/outlookSyncService.test.js`

**Interfaces:**
- Consumes: native bridge safe operations only.
- Produces: active-use-only sync service.

- [ ] **Step 1: Write failing metadata scan tests**

```js
// tests/platform/android/outlook/outlookSyncService.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { filterMetadataForApprovedSenders, buildScanWindow } from "../../../../platform/android/outlook/outlookSyncService.js";

test("scan window uses overlap instead of only one timestamp cursor", () => {
  const window = buildScanWindow({ lastSuccessUtcMs: Date.parse("2026-08-21T12:00:00.000Z"), overlapMinutes: 15 });
  assert.equal(window.sinceUtcMs, Date.parse("2026-08-21T11:45:00.000Z"));
});

test("metadata filtering discards unapproved senders before body fetch", () => {
  const approved = filterMetadataForApprovedSenders([
    { id: "1", sender: { emailAddress: { address: "jobs@approved.example" } }, subject: "Job" },
    { id: "2", sender: { emailAddress: { address: "spam@example.net" } }, subject: "No" }
  ], [{ sender_domains_json: ["approved.example"] }]);
  assert.deepEqual(approved.map(m => m.id), ["1"]);
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/platform/android/outlook/outlookSyncService.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement scan logic**

Implement:

- app-open sync
- foreground sync throttled to five minutes
- manual Sync now
- overlap window
- processed message IDs and hashes
- approved-sender metadata filtering
- body fetch only through `fetchApprovedMessageBody(messageId)`

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/platform/android/outlook/outlookSyncService.test.js`

Expected: PASS.

- [ ] **Rollback point**

Rollback: `git restore platform/android/outlook tests/platform/android/outlook`

- [ ] **Commit checkpoint**

```bash
git add platform/android/outlook tests/platform/android/outlook
git commit -m "feat: add active-use outlook metadata sync"
```

---

## Task 11: Android Route UI And Local Transit Cache

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`
- Create: `platform/android/storage/transitRepository.js`
- Modify: `shared/domain/routeScore.js`
- Modify: `tests/domain/routeScore.test.js`

**Interfaces:**
- Consumes: shared route scoring and Android local transit cache.
- Produces: best two or three next-stop choices and route freshness/confidence labels.

- [ ] **Step 1: Add failing route candidate tests**

Extend `tests/domain/routeScore.test.js` to assert that overdue/today/tomorrow urgency, clustering, walking burden, and transit proximity all affect score.

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/domain/routeScore.test.js`

Expected: FAIL until scoring weights are implemented.

- [ ] **Step 3: Implement local transit cache adapter**

Android stores usable transit stop/route snapshots locally. Static GTFS-derived data must display `scheduled estimate`.

- [ ] **Step 4: Update route UI**

Keep the top-level `Open Selected Route` action. The planner opens the route map/modal in app, shows planned order, and exposes details per leg without scrolling the user away from the top controls.

- [ ] **Step 5: Run tests and Android build**

Run: `npm test -- tests/domain/routeScore.test.js`

Expected: PASS.

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Rollback point**

Rollback: `git restore frontend platform/android/storage/transitRepository.js shared/domain/routeScore.js tests/domain/routeScore.test.js`

- [ ] **Commit checkpoint**

```bash
git add frontend platform/android/storage/transitRepository.js shared/domain/routeScore.js tests/domain/routeScore.test.js
git commit -m "feat: add android route candidates and transit cache"
```

---

## Task 12: Ledger, Completion States, And User Backup

**Files:**
- Modify: `shared/domain/finance.js`
- Modify: `shared/domain/reconcile.js`
- Modify: `platform/android/storage/schema.js`
- Modify: `platform/android/storage/migrations.js`
- Create: `platform/android/storage/backupService.js`
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`
- Modify: `tests/domain/finance.test.js`
- Modify: `tests/platform/android/storage/migrations.test.js`

**Interfaces:**
- Consumes: job and expense tables.
- Produces: awaiting payment/completed workflow and encrypted user export/import separate from migration snapshots.

- [ ] **Step 1: Write failing finance and status tests**

```js
// tests/domain/finance.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { calculateJobFinancials } from "../../shared/domain/finance.js";

test("financial totals use cents", () => {
  const result = calculateJobFinancials({ pay_cents: 1600, bonus_cents: 200 }, [{ amount_cents: 500, reimbursable: true }]);
  assert.equal(result.gross_cents, 1800);
  assert.equal(result.reimbursable_expenses_cents, 500);
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/domain/finance.test.js tests/platform/android/storage/migrations.test.js`

Expected: FAIL until ledger/export behavior is implemented.

- [ ] **Step 3: Implement status transitions**

Supported status flow:

- `available`
- `planned`
- `submitted`
- `awaiting_payment`
- `paid`
- `completed`

If provider data says paid, move to completed. If user marks submitted, move to awaiting_payment.

- [ ] **Step 4: Implement encrypted user export/import**

This is separate from automatic app-private migration snapshots. User-facing export/import is manual.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Rollback point**

Rollback: `git restore shared/domain platform/android/storage frontend tests`

- [ ] **Commit checkpoint**

```bash
git add shared/domain platform/android/storage frontend tests
git commit -m "feat: add ledger states and user backup"
```

---

## Task 13: Final Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-21-gig-route-planner-architecture.md`
- Modify: `docs/superpowers/plans/2026-08-21-gig-route-planner-capacitor-outlook.md`

**Interfaces:**
- Consumes: all prior completed phases.
- Produces: verified setup and usage handoff.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run Android build**

Run: `cd android && .\gradlew.bat assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Verify desktop server**

Run: `npm start`

Expected: server listens on port 3300 and does not auto-open browser or start closed-app polling.

- [ ] **Step 4: Verify no secrets tracked**

Run: `git status --short`

Expected: only intended source/docs/test files are changed. No `.env`, DB, token cache, runtime snapshot, private export, or `android/.idea/` files are staged.

- [ ] **Step 5: Update README**

Document:

- desktop start command
- Android build/install command
- active-use-only Outlook sync behavior
- required Microsoft app registration fields
- location permission behavior
- incoming share supported MIME types
- private migration snapshots
- manual encrypted export/import
- static transit estimate labeling
- no Google Maps Platform/OpenAI/Vercel/cloud DB requirement for private MVP

- [ ] **Rollback point**

Rollback: `git restore README.md docs/superpowers/specs/2026-08-21-gig-route-planner-architecture.md docs/superpowers/plans/2026-08-21-gig-route-planner-capacitor-outlook.md`

- [ ] **Commit checkpoint**

```bash
git add README.md docs/superpowers/specs/2026-08-21-gig-route-planner-architecture.md docs/superpowers/plans/2026-08-21-gig-route-planner-capacitor-outlook.md
git commit -m "docs: document gig route planner setup and verification"
```

---

## Risks And Rollback Summary

- Capacitor migration risk: rollback Task 5 and keep current Android wrapper.
- Native MSAL risk: rollback Task 9 and keep Outlook disabled.
- Outlook scan risk: if Graph behavior differs, keep manual/import/share data only.
- Incoming share risk: if MIME filters are too narrow, add specific MIME types after testing; do not add `*/*`.
- Provider deep-link risk: use browser fallback until exact package/deep-link values are verified.
- Transit data risk: static GTFS remains scheduled estimate until a verified realtime feed exists.
- Migration risk: restore app-private pre-migration snapshot.
- Desktop regression risk: rollback desktop adapter task and keep existing server files.

## Self-Review

- Spec coverage: all required corrections are represented in tasks and global constraints.
- Token safety: native bridge exposes safe operations only; frontend never receives access tokens.
- Email safety: metadata scan uses overlap plus processed IDs/hashes and only fetches approved bodies.
- Native setup: Java is the default because MainActivity is Java; Kotlin requires explicit Gradle edits.
- MIME safety: exact MIME types are listed; wildcard MIME is explicitly rejected.
- Money/time consistency: schema uses cents and UTC epoch milliseconds.
- Migration safety: app-private snapshots are separate from user-facing encrypted export/import.
- Implementation status: no application code should be changed until this plan is approved for execution.

