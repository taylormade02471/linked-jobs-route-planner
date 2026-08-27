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
    ["survey_merchandiser", "clickworker", "field_nation"],
  );
  assert.ok(backbone.PROVIDERS.every((provider) => provider.loginUrl));
});

test("provider connection settings keep status but reject secrets", () => {
  const safe = backbone.sanitizeConnectionSettings({
    provider_id: "clickworker",
    status: "signed_in_external",
    account_label: "main phone account",
    notes: "Logged in through Workplace",
    password: "do-not-store",
    access_token: "do-not-store",
    cookie: "do-not-store",
  });

  assert.deepEqual(Object.keys(safe).sort(), [
    "account_label",
    "notes",
    "provider_id",
    "rejected_secret_fields",
    "status",
    "updated_at",
  ]);
  assert.equal(safe.provider_id, "clickworker");
  assert.equal(safe.status, "signed_in_external");
  assert.equal(safe.rejected_secret_fields, true);
  assert.equal(JSON.stringify(safe).includes("do-not-store"), false);
  assert.equal(backbone.connectionLabel(safe), "Connected on this phone/browser");
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
