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
  assert.ok(backbone.PROVIDERS.every((provider) => provider.emailDomains.length));
});

test("email permission options include Outlook Mail.Read without write permission", () => {
  const outlook = backbone.EMAIL_PERMISSION_OPTIONS.find((option) => option.id === "outlook_mail_read");

  assert.ok(outlook);
  assert.equal(outlook.permission, "Microsoft Graph delegated Mail.Read");
  assert.match(outlook.scope, /Mail\.Read$/);
  assert.doesNotMatch(JSON.stringify(backbone.EMAIL_PERMISSION_OPTIONS), /Mail\.ReadWrite|Mail\.Send/i);
});

test("connection setup lists email OAuth and provider app bridge paths", () => {
  const ids = backbone.CONNECTION_SETUP.map((item) => item.id);
  const outlook = backbone.CONNECTION_SETUP.find((item) => item.id === "outlook_mail_read_oauth");
  const appBridge = backbone.CONNECTION_SETUP.find((item) => item.id === "provider_phone_app_bridge");

  assert.deepEqual(ids, [
    "outlook_mail_read_oauth",
    "gmail_readonly_oauth",
    "provider_phone_app_bridge",
    "provider_visible_page_connector",
  ]);
  assert.match(outlook.permission, /Mail\.Read only/);
  assert.ok(outlook.redirectUris.includes("https://nashville-live-audit-transit-planne.vercel.app/"));
  assert.match(appBridge.permission, /text\/plain share intake/);
  assert.doesNotMatch(JSON.stringify(backbone.CONNECTION_SETUP), /client_secret|access_token|refresh_token|Mail\.Send|Mail\.ReadWrite/i);
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

test("email sync settings preserve allowlist but reject credential fields", () => {
  const safe = backbone.sanitizeEmailSyncSettings({
    account_label: "Hotmail job inbox",
    permission_id: "outlook_mail_read",
    sender_allowlist: "survey.com\nfieldagent.net",
    metadata_first: true,
    background_sync_enabled: true,
    sync_interval_minutes: 15,
    access_token: "do-not-store",
  });

  assert.equal(safe.account_label, "Hotmail job inbox");
  assert.equal(safe.permission_id, "outlook_mail_read");
  assert.equal(safe.metadata_first, true);
  assert.equal(safe.background_sync_enabled, true);
  assert.equal(safe.sync_interval_minutes, 15);
  assert.equal(safe.rejected_secret_fields, true);
  assert.equal(JSON.stringify(safe).includes("do-not-store"), false);
});

test("email parser imports allowed provider senders and ignores other senders", () => {
  const settings = backbone.sanitizeEmailSyncSettings({
    sender_allowlist: "survey.com\nfieldagent.net",
  });
  const imported = backbone.parseEmailText(
    "From: alerts@survey.com\nSubject: New Nashville assignment\n\nStore audit\n3019 Dickerson Pike, Nashville, TN\nPay $18.00\nAvailable",
    settings,
  );
  const ignored = backbone.parseEmailText(
    "From: random@example.com\nSubject: coupon\n\nPay $100",
    settings,
  );

  assert.equal(imported.ignored, false);
  assert.equal(imported.provider_id, "survey_merchandiser");
  assert.equal(imported.jobs[0].source, "email-import");
  assert.equal(imported.jobs[0].pay_cents, 1800);
  assert.equal(ignored.ignored, true);
  assert.equal(ignored.reason, "sender_not_allowed");
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
