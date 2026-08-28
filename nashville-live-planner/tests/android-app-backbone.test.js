const assert = require("node:assert/strict");
const test = require("node:test");

const work = require("../work-app-backbone.js");
const android = require("../android-app-backbone.js");

test("Android credential save request keeps password out of public state", () => {
  const request = android.createCredentialSaveRequest({
    provider_id: "survey_merchandiser",
    username: "kyle@example.com",
    password: "super-secret-password",
  });

  assert.equal(request.native_payload.provider_id, "survey_merchandiser");
  assert.equal(request.native_payload.username, "kyle@example.com");
  assert.equal(request.native_payload.password, "super-secret-password");
  assert.equal(request.public_state.provider_id, "survey_merchandiser");
  assert.equal(request.public_state.has_saved_login, true);
  assert.equal(request.public_state.vault, "android_encrypted_storage");
  assert.equal(JSON.stringify(request.public_state).includes("super-secret-password"), false);
});

test("Android import review approves route-visible open assigned and needs-completion work", () => {
  const reviewItems = android.createImportReviewItems(
    [
      "Walgreens tobacco audit\n7601 Hwy 70 S, Nashville, TN 37221\nPay $38.50\nAvailable",
      "Phone display visit\n3019 Dickerson Pike, Nashville, TN\nPay $18.00\nApply required",
      "Already claimed audit\n1622 Madison St, Clarksville, TN\nPay $16.00\nClaimed",
      "Late accepted audit\n1801 Madison St, Clarksville, TN\nPay $16.00\nNeeds completion",
    ].join("\n\n"),
    "survey_merchandiser",
    work,
  );

  assert.deepEqual(
    reviewItems.map((item) => [item.status, item.approvable]),
    [
      ["available", true],
      ["applied", false],
      ["assigned", true],
      ["needs_completion", true],
    ],
  );

  const approvedJobs = android.approveRouteVisibleReviewItems(reviewItems);

  assert.equal(approvedJobs.length, 3);
  assert.equal(approvedJobs[0].status, "available");
  assert.match(approvedJobs[0].address, /7601 Hwy 70 S/i);
  assert.equal(approvedJobs[1].status, "assigned");
  assert.equal(approvedJobs[2].status, "needs_completion");
  assert.equal(approvedJobs[0].source, "android-import-review");
});

test("Android safe sync payload removes credentials but keeps route job details", () => {
  const payload = android.createSafeJobSyncPayload(
    [
      {
        provider_id: "field_nation",
        external_id: "fn-123",
        title: "Router swap",
        status: "assigned",
        address: "1801 Madison St, Clarksville, TN",
        pay_cents: 8500,
        due: "Today 5:00 PM",
        minutes: 90,
        distance_miles: 11.4,
        duration_text: "Not visible in screen recording",
        ready_state: "ready_to_start",
        source_video: "Screen_Recording_20260828_130331.mp4",
        requirements: "arrival photo and notes",
        password: "do-not-send",
        source_text: "raw scrape text",
      },
    ],
    work,
  );

  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].status, "assigned");
  assert.equal(payload.jobs[0].requirements, "arrival photo and notes");
  assert.equal(payload.jobs[0].distance_miles, 11.4);
  assert.equal(payload.jobs[0].duration_text, "Not visible in screen recording");
  assert.equal(payload.jobs[0].ready_state, "ready_to_start");
  assert.equal(payload.jobs[0].source_video, "Screen_Recording_20260828_130331.mp4");
  assert.equal(JSON.stringify(payload).includes("do-not-send"), false);
  assert.equal(JSON.stringify(payload).includes("raw scrape text"), false);
});

test("Android safe sync can send completed archive rows without making them route jobs", () => {
  const payload = android.createSafeJobSyncPayload(
    [
      {
        provider_id: "survey_merchandiser",
        external_id: "sm-old",
        title: "Old live-site job",
        status: "paid",
        address: "3075 Highway 41A S, Clarksville, TN",
        pay_cents: 4950,
        minutes: 50,
        password: "do-not-send",
      },
      {
        provider_id: "field_agent",
        title: "Apply-only job",
        status: "apply required",
      },
    ],
    work,
  );

  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].title, "Old live-site job");
  assert.equal(payload.jobs[0].status, "completed");
  assert.equal(JSON.stringify(payload).includes("do-not-send"), false);
});

test("Android share intake accepts text screenshots and PDFs but rejects unsupported files", () => {
  assert.equal(android.normalizeSharePayload({ mime_type: "text/plain", text: "Available\nPay $12" }).accepted, true);
  assert.equal(android.normalizeSharePayload({ mime_type: "image/png", uri: "content://job-card" }).kind, "screenshot");
  assert.equal(android.normalizeSharePayload({ mime_type: "image/jpeg", uri: "content://job-card" }).kind, "screenshot");
  assert.equal(android.normalizeSharePayload({ mime_type: "application/pdf", uri: "content://job-pdf" }).kind, "pdf");

  const rejected = android.normalizeSharePayload({ mime_type: "application/zip", uri: "content://archive" });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason, /not supported/i);
});

test("Provider check plan never scans private native app storage", () => {
  const plan = android.createProviderCheckPlan({
    provider_id: "survey_merchandiser",
    has_saved_login: true,
  });

  assert.equal(plan.provider_id, "survey_merchandiser");
  assert.equal(plan.can_use_saved_login, true);
  assert.equal(plan.can_scan_private_app_storage, false);
  assert.deepEqual(plan.allowed_methods, [
    "open_provider_app",
    "share_visible_text",
    "capture_screenshot",
    "browser_board_adapter_if_available",
  ]);
  assert.equal(plan.allowed_methods.includes("native_app_storage_scan"), false);
});
