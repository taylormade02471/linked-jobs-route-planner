const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..", "..");
const plannerRoot = path.join(__dirname, "..");

test("Nashville planner exposes only the requested phone work providers", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const backbone = fs.readFileSync(path.join(plannerRoot, "work-app-backbone.js"), "utf8");

  assert.match(index, /Survey Merchandiser/);
  assert.match(index, /Clickworker/);
  assert.match(index, /Field Nation/);
  assert.match(index, /Field Agent/);
  assert.doesNotMatch(index, /Jobslinger|MegaLog|SASSIE/i);
  assert.doesNotMatch(backbone, /Jobslinger|MegaLog|SASSIE/i);
});

test("public planner pages expose the current safe video-imported job dataset", () => {
  const nashvilleIndex = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const nashvilleData = fs.readFileSync(path.join(plannerRoot, "planner-data.js"), "utf8");
  const desktopIndex = fs.readFileSync(path.join(projectRoot, "frontend", "index.html"), "utf8");

  assert.match(nashvilleIndex, /Submitted job list loaded/);
  assert.match(nashvilleIndex, /clearLegacyPlannerStorage/);
  assert.match(nashvilleIndex, /nashville_phone_work_jobs_v1/);
  assert.doesNotMatch(nashvilleIndex, /current 18 quick|18 jobs = \$153|1-hour Walgreens|7601 Hwy 70 S/i);
  assert.match(nashvilleData, /Screen_Recording_20260827_233541\.mp4/);
  assert.match(nashvilleData, /"jobs":\{/);
  assert.match(nashvilleData, /Dollar General Store #2360/);
  assert.match(nashvilleData, /Family Dollar Store #1033/);
  assert.doesNotMatch(nashvilleData, /password|access_token|refresh_token|cookie|source_text/i);
  assert.doesNotMatch(desktopIndex, /Jobslinger|MegaLog|Save live login|source_password/i);
});

test("Nashville planner has camera capture controls for phone job intake", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /id="startCamera"/);
  assert.match(index, /id="captureCamera"/);
  assert.match(index, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(index, /photo_data_url/);
});

test("Nashville planner stores provider connection state without credential fields", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const backbone = fs.readFileSync(path.join(plannerRoot, "work-app-backbone.js"), "utf8");

  assert.match(index, /PROVIDER_CONNECTIONS_KEY/);
  assert.match(index, /Mark connected here/);
  assert.match(index, /Open installed phone app/);
  assert.match(index, /Keep using provider app\/browser saved login/);
  assert.match(index, /Auto-check interval/);
  assert.match(index, /Save background update settings/);
  assert.match(index, /Check provider now/);
  assert.match(index, /Account label, not password/);
  assert.match(backbone, /sanitizeConnectionSettings/);
  assert.match(backbone, /background_sync_enabled/);
  assert.match(backbone, /SECRET_FIELD_PATTERN/);
  assert.doesNotMatch(index, /id="providerPassword"|id="providerToken"|access_token|refresh_token/i);
});

test("Nashville planner exposes Android provider settings and import review controls without public login fields", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /android-app-backbone\.js/);
  assert.match(index, /id="openProviderSettings"/);
  assert.match(index, /Open Android provider settings/);
  assert.doesNotMatch(index, /id="providerLoginUsername"/);
  assert.doesNotMatch(index, /id="providerLoginPassword"/);
  assert.doesNotMatch(index, /Save encrypted Android login/);
  assert.match(index, /id="importReviewQueue"/);
  assert.match(index, /id="approveImportReview"/);
  assert.match(index, /id="clearImportReview"/);
});

test("Nashville planner can show all apps or one app with green yellow red job statuses", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /id="jobProviderFilter"/);
  assert.match(index, /All apps together/);
  assert.match(index, /id="jobStatusFilter"/);
  assert.match(index, /Available \/ open to claim/);
  assert.match(index, /Claimed \/ assigned/);
  assert.match(index, /Needs completion/);
  assert.match(index, /green = open to claim/i);
  assert.match(index, /yellow = claimed\/assigned/i);
  assert.match(index, /red = needs completion/i);
  assert.match(index, /PAYMENT_SNAPSHOTS_KEY/);
  assert.match(index, /Payment center snapshot/);
});

test("Nashville planner separates job tabs and hides transit until View route", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /id="jobTabOpen"/);
  assert.match(index, /Open jobs/);
  assert.match(index, /id="jobTabAccepted"/);
  assert.match(index, /Accepted \/ claimed/);
  assert.match(index, /id="jobTabCompleted"/);
  assert.match(index, /Completed jobs/);
  assert.match(index, /id="viewSelectedRoute"/);
  assert.match(index, /View route/);
  assert.match(index, /id="bulkJobFolder"/);
  assert.match(index, /id="moveSelectedJobs"/);
  assert.match(index, /Move selected/);
  assert.match(index, /Pending payment/);
  assert.match(index, /showTransitRoute=false/);
  assert.match(index, /drawTransitRoute/);
  assert.match(index, /Select jobs, then View route/);
  assert.match(index, /EXISTING_JOBS_COMPLETED_KEY/);
  assert.match(index, /moveExistingSavedJobsToCompletedOnce/);
});

test("Nashville planner keeps the map first, collapses the job board, and caps routes at 20 stops", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /main>#mainMap\{order:1\}/);
  assert.match(index, /main>#workApps\{order:2\}/);
  assert.match(index, /<details class="card" id="workApps">/);
  assert.match(index, /Custom route/);
  assert.match(index, /Automatic best route/);
  assert.match(index, /at most 20 stops/);
  assert.match(index, /Transit buses are hidden until you press View route/);
});

test("Nashville planner links saved jobs to a separate active and passed history page", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const history = fs.readFileSync(path.join(plannerRoot, "jobs.html"), "utf8");
  const backbone = fs.readFileSync(path.join(plannerRoot, "work-app-backbone.js"), "utf8");

  assert.match(index, /jobs\.html/);
  assert.match(index, /Completed \/ passed \/ paid/);
  assert.match(history, /Saved jobs and passed history/);
  assert.match(history, /Available \/ active/);
  assert.match(history, /Completed \/ passed/);
  assert.match(history, /Mark visible jobs as passed/);
  assert.match(history, /Download visible jobs JSON/);
  assert.match(history, /nashville_phone_work_jobs_v1/);
  assert.match(backbone, /isCompletedJob/);
});

test("Nashville planner exposes safe read-only email sync settings", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const backbone = fs.readFileSync(path.join(plannerRoot, "work-app-backbone.js"), "utf8");

  assert.match(index, /Email job sync permissions/);
  assert.match(index, /EMAIL_SYNC_SETTINGS_KEY/);
  assert.match(index, /Open Outlook\/Hotmail inbox/);
  assert.match(index, /Connect Gmail readonly/);
  assert.match(index, /Scan Gmail now/);
  assert.match(index, /Save email permission settings/);
  assert.match(index, /Connection setup checklist/);
  assert.match(index, /Scan sender\/subject\/date first/);
  assert.match(index, /accounts\.google\.com\/gsi\/client/);
  assert.match(index, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages/);
  assert.match(index, /memory-only and not saved/i);
  assert.match(backbone, /Microsoft Graph delegated Mail\.Read/);
  assert.match(backbone, /outlook_mail_read_oauth/);
  assert.match(backbone, /provider_phone_app_bridge/);
  assert.match(backbone, /senderAllowed/);
  assert.match(backbone, /parseEmailText/);
  assert.doesNotMatch(index, /Mail\.Send|Mail\.ReadWrite|emailPassword|emailToken|localStorage\.setItem\([^)]*token|refresh_token/i);
});

test("Nashville planner exposes the complete Key Vault reference plan", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const backbone = fs.readFileSync(path.join(plannerRoot, "work-app-backbone.js"), "utf8");

  assert.match(index, /Azure Key Vault connection plan/);
  assert.match(index, /KEY_VAULT_PLAN_KEY/);
  assert.match(index, /Save Key Vault references locally/);
  assert.match(index, /Clear Key Vault plan/);
  assert.match(index, /No private secret values are accepted/);
  assert.match(index, /keyVaultBindings/);
  assert.match(backbone, /KEY_VAULT_BINDINGS/);
  assert.match(backbone, /sanitizeKeyVaultPlan/);
  assert.match(backbone, /planner-api-secret/);
  assert.match(backbone, /survey-merchandiser-api-key/);
  assert.match(backbone, /clickworker-api-key/);
  assert.match(backbone, /field-nation-api-key/);
  assert.match(backbone, /field-agent-api-key/);
  assert.doesNotMatch(index, /id="keyVaultSecretValue"|id="keyVaultPassword"|id="keyVaultClientSecret"/i);
});

test("public privacy and terms pages support restricted email OAuth review", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");
  const privacy = fs.readFileSync(path.join(plannerRoot, "privacy.html"), "utf8");
  const terms = fs.readFileSync(path.join(plannerRoot, "terms.html"), "utf8");

  assert.match(index, /privacy\.html/);
  assert.match(index, /terms\.html/);
  assert.match(privacy, /Microsoft Graph\s+delegated Mail\.Read/);
  assert.match(privacy, /gmail\.readonly/);
  assert.match(privacy, /does not ask for your email password/i);
  assert.match(privacy, /must not be committed to GitHub/i);
  assert.match(terms, /provider passwords, MFA codes, cookies, client secrets/i);
  assert.match(terms, /must not send, delete,\s+modify, or manage email/i);
});

test("Android shell loads the Nashville planner and requests network location and camera permissions", () => {
  const manifest = fs.readFileSync(path.join(projectRoot, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const gradleProperties = fs.readFileSync(path.join(projectRoot, "android", "gradle.properties"), "utf8");
  const activity = fs.readFileSync(
    path.join(projectRoot, "android", "app", "src", "main", "java", "com", "linkedjobs", "routeplanner", "MainActivity.java"),
    "utf8",
  );
  const settingsActivity = fs.readFileSync(
    path.join(projectRoot, "android", "app", "src", "main", "java", "com", "linkedjobs", "routeplanner", "ProviderConnectionActivity.java"),
    "utf8",
  );
  const credentialStore = fs.readFileSync(
    path.join(projectRoot, "android", "app", "src", "main", "java", "com", "linkedjobs", "routeplanner", "ProviderCredentialStore.java"),
    "utf8",
  );

  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(gradleProperties, /android\.useAndroidX=true/);
  assert.match(gradleProperties, /android\.enableJetifier=true/);
  assert.match(manifest, /iSurvey\.Android/);
  assert.match(manifest, /net\.fieldagent/);
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(manifest, /android\.intent\.action\.SEND_MULTIPLE/);
  assert.match(manifest, /image\/png/);
  assert.match(manifest, /image\/jpeg/);
  assert.match(manifest, /application\/pdf/);
  assert.match(manifest, /ProviderConnectionActivity/);
  assert.match(activity, /https:\/\/www\.routeplanner\.space/);
  assert.match(activity, /openProviderSettings/);
  assert.match(activity, /getProviderLoginStatus/);
  assert.match(activity, /onGeolocationPermissionsShowPrompt/);
  assert.match(activity, /onPermissionRequest/);
  assert.match(activity, /addJavascriptInterface/);
  assert.match(activity, /openProviderApp/);
  assert.match(activity, /LinkedJobsAndroid/);
  assert.match(activity, /LinkedJobsReceiveAndroidShare/);
  assert.match(settingsActivity, /Provider Connections/);
  assert.match(settingsActivity, /Save encrypted login/);
  assert.match(settingsActivity, /Clear saved login/);
  assert.match(credentialStore, /EncryptedSharedPreferences/);
  assert.match(credentialStore, /PrefKeyEncryptionScheme\.AES256_SIV/);
});
