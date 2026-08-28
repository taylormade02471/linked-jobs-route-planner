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

test("Nashville planner shows open jobs green assigned jobs yellow and payment snapshots", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /Available \/ open to claim/);
  assert.match(index, /Claimed \/ assigned/);
  assert.match(index, /green = open to claim/i);
  assert.match(index, /yellow = claimed\/assigned/i);
  assert.match(index, /PAYMENT_SNAPSHOTS_KEY/);
  assert.match(index, /Payment center snapshot/);
});

test("Android shell loads the Nashville planner and requests network location and camera permissions", () => {
  const manifest = fs.readFileSync(path.join(projectRoot, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const activity = fs.readFileSync(
    path.join(projectRoot, "android", "app", "src", "main", "java", "com", "linkedjobs", "routeplanner", "MainActivity.java"),
    "utf8",
  );

  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /iSurvey\.Android/);
  assert.match(manifest, /net\.fieldagent/);
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(activity, /https:\/\/www\.routeplanner\.space/);
  assert.match(activity, /onGeolocationPermissionsShowPrompt/);
  assert.match(activity, /onPermissionRequest/);
  assert.match(activity, /addJavascriptInterface/);
  assert.match(activity, /openProviderApp/);
  assert.match(activity, /LinkedJobsAndroid/);
  assert.match(activity, /sharedTextFromIntent/);
});
