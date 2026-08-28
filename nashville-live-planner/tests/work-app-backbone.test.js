const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const backbone = require("../work-app-backbone.js");
const plannerDataSource = fs.readFileSync(path.join(__dirname, "..", "planner-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(plannerDataSource, context);
const data = context.window.PLANNER_DATA;

test("Nashville backbone targets the requested phone work apps", () => {
  assert.deepEqual(
    backbone.PROVIDERS.map((provider) => provider.id),
    ["survey_merchandiser", "clickworker", "field_nation", "field_agent"],
  );
  assert.ok(backbone.PROVIDERS.every((provider) => provider.loginUrl));
  assert.ok(backbone.PROVIDERS.every((provider) => provider.androidPackage));
  assert.ok(backbone.PROVIDERS.every((provider) => provider.androidIntentUrl));
});

test("provider connection settings keep status but reject secrets", () => {
  const safe = backbone.sanitizeConnectionSettings({
    provider_id: "clickworker",
    status: "signed_in_external",
    account_label: "main phone account",
    notes: "Logged in through Workplace",
    stay_signed_in_external: true,
    background_sync_enabled: true,
    sync_interval_minutes: 10,
    last_sync_at: 1000,
    sync_status: "Last visible app share saved",
    password: "do-not-store",
    access_token: "do-not-store",
    cookie: "do-not-store",
  });

  assert.deepEqual(Object.keys(safe).sort(), [
    "account_label",
    "background_sync_enabled",
    "last_sync_at",
    "notes",
    "provider_id",
    "rejected_secret_fields",
    "status",
    "stay_signed_in_external",
    "sync_interval_minutes",
    "sync_status",
    "updated_at",
  ]);
  assert.equal(safe.provider_id, "clickworker");
  assert.equal(safe.status, "signed_in_external");
  assert.equal(safe.stay_signed_in_external, true);
  assert.equal(safe.background_sync_enabled, true);
  assert.equal(safe.sync_interval_minutes, 10);
  assert.equal(safe.last_sync_at, 1000);
  assert.equal(safe.rejected_secret_fields, true);
  assert.equal(JSON.stringify(safe).includes("do-not-store"), false);
  assert.equal(backbone.connectionLabel(safe), "Connected on this phone/browser");
  assert.equal(backbone.nextSyncAt(safe, 2000), 601000);
});

test("background sync settings reject unsupported intervals", () => {
  const safe = backbone.sanitizeConnectionSettings({
    provider_id: "survey_merchandiser",
    status: "signed_in_external",
    background_sync_enabled: true,
    sync_interval_minutes: 7,
  });

  assert.equal(safe.background_sync_enabled, false);
  assert.equal(safe.sync_interval_minutes, 0);
  assert.equal(backbone.nextSyncAt(safe), 0);
});

test("open available filtering excludes applied planned and completed jobs", () => {
  const jobs = [
    { status: "available" },
    { status: "open" },
    { status: "applied" },
    { status: "accepted" },
    { status: "paid" },
  ];

  assert.equal(jobs.filter(backbone.isOpenAvailableJob).length, 2);
  assert.equal(jobs.filter(backbone.isAssignedJob).length, 1);
});

test("shared phone app text preserves provider pay address and status", () => {
  const [job] = backbone.parseSharedJobs(
    "Walgreens audit\n7601 Hwy 70 S, Nashville, TN 37221\nPay $38.50\nDue tomorrow\nAvailable",
    "field_nation",
  );

  assert.equal(job.provider_id, "field_nation");
  assert.equal(job.pay_cents, 3850);
  assert.match(job.address, /7601 Hwy 70 S/i);
  assert.equal(job.status, "available");
});

test("shared phone app text can preserve assigned status and payment hints", () => {
  const [job] = backbone.parseSharedJobs(
    "Survey store reset\n3019 Dickerson Pike, Nashville, TN\nPay $18.00\nClaimed\nPayment pending",
    "survey_merchandiser",
  );

  assert.equal(job.provider_id, "survey_merchandiser");
  assert.equal(job.status, "assigned");
  assert.match(job.payment_status, /Payment pending/i);
});

test("payment center text preserves provider amount and payment status", () => {
  const [payment] = backbone.parsePaymentCenterText(
    "Survey Merchandiser Payment\n$42.50\nApproved pending payout\n08/28",
    "survey_merchandiser",
  );

  assert.equal(payment.provider_id, "survey_merchandiser");
  assert.equal(payment.amount_cents, 4250);
  assert.match(payment.payment_status, /Approved pending payout/i);
  assert.equal(payment.source, "payment-center-import");
});

test("known Nashville planner addresses can be placed without inventing coordinates", () => {
  const job = {
    provider_id: "survey_merchandiser",
    title: "Quick audit",
    address: "3019 Dickerson Pike, Nashville, TN",
    pay_cents: 850,
    status: "available",
  };

  const point = backbone.coordinateForJob(job, data);
  assert.ok(point);
  assert.equal(point.source, "matched Nashville planner address");
  assert.equal(point.route, "23");
});

test("recommendations favor higher earning efficient mapped work", () => {
  const origin = { lat: 36.16682, lon: -86.78131 };
  const recommended = backbone.recommendJobs(
    [
      {
        provider_id: "clickworker",
        title: "Low pay",
        address: "3019 Dickerson Pike, Nashville, TN",
        pay_cents: 850,
        minutes: 45,
        status: "available",
      },
      {
        provider_id: "field_nation",
        title: "Better pay",
        address: "7601 Hwy 70 S, Nashville, TN 37221",
        pay_cents: 3850,
        minutes: 60,
        status: "available",
      },
    ],
    data,
    origin,
  );

  assert.equal(recommended[0].title, "Better pay");
  assert.ok(recommended[0].recommendation_score > recommended[1].recommendation_score);
});
