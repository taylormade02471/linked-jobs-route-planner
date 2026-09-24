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
const routeFixture = {
  jobs: {
    Q11: { address: "3019 Dickerson Pike, Nashville, TN", minutes: 5 },
    A1: { address: "7601 Hwy 70 S, Nashville, TN 37221", minutes: 60 },
  },
  sections: {
    dickerson: {
      legs: [
        {
          route: "23",
          job: "Q11",
          destination: "3019 Dickerson Pike, Nashville, TN",
          board_stop: { name: "CENTRAL 4TH AVE - BAY 24", lat: 36.16682, lon: -86.78131 },
          alight_stop: { name: "DICKERSON PIKE & BEN ALLEN RD NB", lat: 36.225551, lon: -86.760196 },
        },
      ],
    },
    west: {
      legs: [
        {
          route: "3",
          job: "A1",
          destination: "7601 Hwy 70 S, Nashville, TN 37221",
          board_stop: { name: "CENTRAL 5TH AVE - BAY 5", lat: 36.16652, lon: -86.78135 },
          alight_stop: { name: "COLEY DAVIS RD SHELTER PARK AND RIDE", lat: 36.075212, lon: -86.952437 },
        },
      ],
    },
  },
};

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
  const gmail = backbone.CONNECTION_SETUP.find((item) => item.id === "gmail_readonly_oauth");
  const appBridge = backbone.CONNECTION_SETUP.find((item) => item.id === "provider_phone_app_bridge");

  assert.deepEqual(ids, [
    "outlook_mail_read_oauth",
    "gmail_readonly_oauth",
    "provider_phone_app_bridge",
    "provider_visible_page_connector",
  ]);
  assert.match(outlook.permission, /Mail\.Read only/);
  assert.ok(outlook.redirectUris.includes("https://nashville-live-audit-transit-planne.vercel.app/"));
  assert.equal(gmail.clientId, "554839816124-pgscs326aspoch273k9b39cpnnthmcps.apps.googleusercontent.com");
  assert.match(gmail.status, /oauth_client_created_testing/);
  assert.match(appBridge.permission, /text\/plain share intake/);
  assert.doesNotMatch(JSON.stringify(backbone.CONNECTION_SETUP), /client_secret|GOCSPX|access_token|refresh_token|Mail\.Send|Mail\.ReadWrite/i);
});

test("API registry exposes only public IDs and safe background sync rules", () => {
  const ids = backbone.API_REGISTRY.map((api) => api.id);
  const azure = backbone.API_REGISTRY.find((api) => api.id === "azure_key_vault");
  const outlook = backbone.API_REGISTRY.find((api) => api.id === "outlook_mail_read_api");
  const gmail = backbone.API_REGISTRY.find((api) => api.id === "gmail_readonly_api");
  const fieldNames = backbone.API_REGISTRY.flatMap((api) => Object.keys(api));

  assert.deepEqual(ids, [
    "azure_key_vault",
    "outlook_mail_read_api",
    "gmail_readonly_api",
    "provider_phone_app_bridge_api",
  ]);
  assert.ok(azure);
  assert.match(azure.storage, /Key Vault/);
  assert.match(azure.status, /ready_for_vault_binding/);
  assert.equal(azure.public_values.vault_name, "linkedjobs-vault");
  assert.equal(azure.public_values.tenant_id, "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5");
  assert.equal(azure.public_values.tenant_name, "Default Directory");
  assert.equal(azure.public_values.primary_domain, "kyletaylor133hotmail.onmicrosoft.com");
  assert.equal(azure.public_values.license, "Microsoft Entra ID Free");
  assert.ok(outlook);
  assert.equal(outlook.public_values.client_id, null);
  assert.match(outlook.status, /ready_for_app_registration/);
  assert.ok(gmail);
  assert.match(gmail.public_values.client_id, /apps\.googleusercontent\.com$/);
  assert.match(gmail.background_sync, /browser session token/);
  assert.doesNotMatch(fieldNames.join(","), /client_secret|refresh_token|access_token|cookie|password|api[_-]?key/i);
});

test("Key Vault binding plan covers every planned connection with reference-only metadata", () => {
  const ids = backbone.KEY_VAULT_BINDINGS.map((binding) => binding.id);

  assert.deepEqual(ids, [
    "planner_backend",
    "survey_merchandiser",
    "clickworker",
    "field_nation",
    "field_agent",
    "outlook_mail_read",
    "gmail_readonly",
    "provider_phone_app_bridge",
    "provider_visible_page_connector",
  ]);
  assert.equal(backbone.keyVaultBindingById("field_agent").defaultSecretName, "field-agent-api-key");
  assert.equal(backbone.keyVaultBindingById("outlook_mail_read").defaultSecretName, "");
  assert.ok(backbone.KEY_VAULT_BINDINGS.every((binding) => binding.authorization));
  const definitionFields = backbone.KEY_VAULT_BINDINGS.flatMap((binding) => Object.keys(binding));
  assert.doesNotMatch(definitionFields.join(","), /client_secret|refresh_token|access_token|cookie|password|secret_value/i);
});

test("Key Vault binding settings retain references but never raw secret material", () => {
  const safe = backbone.sanitizeKeyVaultBinding({
    provider_id: "field_agent",
    vault_name: "linkedjobs-vault",
    tenant_id: "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5",
    secret_name: "field-agent-api-key",
    certificate_name: "field-agent-cert",
    key_name: "field-agent-key",
    status: "reference_ready",
  });

  assert.equal(safe.connection_id, "field_agent");
  assert.equal(safe.vault_name, "linkedjobs-vault");
  assert.equal(safe.tenant_id, "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5");
  assert.equal(safe.secret_name, "field-agent-api-key");
  assert.equal(safe.certificate_name, "field-agent-cert");
  assert.equal(safe.key_name, "field-agent-key");
  assert.equal(safe.status, "reference_ready");
  assert.equal(safe.rejected_secret_fields, undefined);

  const rejected = backbone.sanitizeKeyVaultBinding({
    provider_id: "field_agent",
    secret_value: "do-not-store",
    client_secret: "do-not-store",
  });
  assert.equal(rejected.rejected_secret_fields, true);
  assert.doesNotMatch(JSON.stringify(rejected), /do-not-store/);
});

test("Key Vault plan carries the supplied tenant metadata for all bindings", () => {
  const plan = backbone.sanitizeKeyVaultPlan({
    vault_name: "linkedjobs-vault",
    subscription_id: "subscription-placeholder",
    bindings: {
      survey_merchandiser: {
        secret_name: "survey-merchandiser-api-key",
        status: "provider_official_access_required",
      },
    },
  });

  assert.equal(plan.vault_name, "linkedjobs-vault");
  assert.equal(plan.tenant_id, "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5");
  assert.equal(plan.tenant_name, "Default Directory");
  assert.equal(plan.primary_domain, "kyletaylor133hotmail.onmicrosoft.com");
  assert.equal(plan.license, "Microsoft Entra ID Free");
  assert.equal(plan.subscription_id, "subscription-placeholder");
  assert.equal(Object.keys(plan.bindings).length, backbone.KEY_VAULT_BINDINGS.length);
  assert.equal(plan.bindings.survey_merchandiser.secret_name, "survey-merchandiser-api-key");
  assert.equal(plan.bindings.clickworker.secret_name, "clickworker-api-key");
  assert.equal(plan.bindings.clickworker.tenant_id, "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5");
  assert.equal(plan.bindings.gmail_readonly.secret_name, "");
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

test("needs-completion work stays ahead of assigned and open jobs in route recommendations", () => {
  const jobs = [
    { id: "open", title: "Open job", status: "available", address: "100 Main St, Nashville, TN", pay_cents: 1000 },
    { id: "assigned", title: "Assigned job", status: "assigned", address: "100 Main St, Nashville, TN", pay_cents: 1000 },
    { id: "needs", title: "Needs completion job", status: "needs_completion", address: "100 Main St, Nashville, TN", pay_cents: 1000 },
  ];

  const ranked = backbone.recommendRouteJobs(jobs, routeFixture, { lat: 36.1666, lon: -86.78177 }, { provider_id: "all", status: "all" });

  assert.equal(ranked[0].id, "needs");
  assert.equal(ranked[0].status, "needs_completion");
  assert.ok(ranked[0].route_status_priority > ranked[1].route_status_priority);
});

test("api settings sanitize stored registration metadata without secrets", () => {
  const safe = backbone.sanitizeApiSettings({
    api_id: "gmail_readonly_api",
    status: "testing_mode_ready",
    account_label: "main gmail connector",
    background_sync_enabled: true,
    sync_status: "ready",
    last_sync_at: 1234,
    client_secret: "do-not-store",
  });

  assert.equal(safe.api_id, "gmail_readonly_api");
  assert.equal(safe.status, "testing_mode_ready");
  assert.equal(safe.background_sync_enabled, true);
  assert.equal(safe.last_sync_at, 1234);
  assert.equal(safe.rejected_secret_fields, true);
  assert.equal(JSON.stringify(safe).includes("do-not-store"), false);
});

test("credentials manager stays on a separate page and uses encrypted local storage", () => {
  const projectRoot = path.join(__dirname, "..", "..");
  const backend = fs.readFileSync(path.join(projectRoot, "backend", "server.js"), "utf8");
  const credentialsPage = fs.readFileSync(path.join(projectRoot, "frontend", "credentials.html"), "utf8");
  const credentialsJs = fs.readFileSync(path.join(projectRoot, "frontend", "credentials.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "frontend", "index.html"), "utf8");

  assert.match(backend, /\/credentials/);
  assert.match(backend, /aes-256-gcm/);
  assert.match(backend, /credentials\.key/);
  assert.match(credentialsPage, /Credentials Manager/);
  assert.match(credentialsPage, /encrypted at\s+rest/i);
  assert.match(credentialsJs, /fetch\("\/api\/credentials"/);
  assert.match(index, /Open Credentials Manager/);
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

test("map filtering supports all apps one app and green yellow red route statuses", () => {
  const jobs = [
    { provider_id: "survey_merchandiser", title: "Open", status: "available" },
    { provider_id: "field_nation", title: "Accepted", status: "assigned" },
    { provider_id: "field_agent", title: "Urgent", status: "needs completion" },
    { provider_id: "clickworker", title: "Apply", status: "apply required" },
    { provider_id: "survey_merchandiser", title: "Done", status: "paid" },
  ];

  assert.deepEqual(backbone.jobsForMap(jobs, { provider_id: "all", status: "all" }).map((job) => job.title), [
    "Open",
    "Accepted",
    "Urgent",
  ]);
  assert.deepEqual(backbone.jobsForMap(jobs, { provider_id: "field_nation", status: "all" }).map((job) => job.title), [
    "Accepted",
  ]);
  assert.deepEqual(backbone.jobsForMap(jobs, { provider_id: "all", status: "needs_completion" }).map((job) => job.title), [
    "Urgent",
  ]);
  assert.equal(backbone.jobMapColor({ status: "available" }), "green");
  assert.equal(backbone.jobMapColor({ status: "assigned" }), "yellow");
  assert.equal(backbone.jobMapColor({ status: "needs completion" }), "red");
});

test("job tabs keep open accepted and completed work separate", () => {
  const jobs = [
    { provider_id: "survey_merchandiser", title: "Open", status: "available" },
    { provider_id: "field_nation", title: "Accepted", status: "assigned" },
    { provider_id: "field_agent", title: "Urgent", status: "needs completion" },
    { provider_id: "clickworker", title: "Apply", status: "apply required" },
    { provider_id: "survey_merchandiser", title: "Done", status: "paid" },
  ];

  assert.deepEqual(backbone.jobsForTab(jobs, { tab: "open", provider_id: "all" }).map((job) => job.title), ["Open"]);
  assert.deepEqual(backbone.jobsForTab(jobs, { tab: "accepted", provider_id: "all" }).map((job) => job.title), [
    "Accepted",
    "Urgent",
  ]);
  assert.deepEqual(backbone.jobsForTab(jobs, { tab: "completed", provider_id: "all" }).map((job) => job.title), ["Done"]);
  assert.deepEqual(backbone.jobsForTab(jobs, { tab: "open", provider_id: "field_nation" }).map((job) => job.title), []);
  assert.equal(backbone.jobMapColor({ status: "completed" }), "gray");
  assert.equal(backbone.isCompletedJob({ status: "paid" }), true);
});

test("existing live site jobs can be moved to completed without losing job details", () => {
  const completed = backbone.markJobsCompleted(
    [
      {
        provider_id: "survey_merchandiser",
        title: "Old open audit",
        status: "available",
        address: "3075 Highway 41A S, Clarksville, TN",
        pay_cents: 4950,
        due: "Today 6 PM",
        minutes: 50,
      },
    ],
    {
      completed_at: 1770000000000,
      completion_reason: "Moved from old live-site data",
    },
  );

  assert.equal(completed.length, 1);
  assert.equal(completed[0].status, "completed");
  assert.equal(completed[0].completed_at, 1770000000000);
  assert.equal(completed[0].completion_reason, "Moved from old live-site data");
  assert.equal(completed[0].address, "3075 Highway 41A S, Clarksville, TN");
  assert.equal(completed[0].pay_cents, 4950);
  assert.equal(completed[0].minutes, 50);
});

test("selected jobs can be moved to claimed completed or pending payment folders", () => {
  const jobs = [
    { id: "one", title: "Open one", status: "available", pay_cents: 1200 },
    { id: "two", title: "Open two", status: "available", pay_cents: 1800 },
  ];

  const claimed = backbone.moveJobsToFolder(jobs, ["one"], "claimed", { updated_at: 1770000000000 });
  assert.equal(claimed.find((job) => job.id === "one").status, "assigned");
  assert.equal(claimed.find((job) => job.id === "two").status, "available");

  const completed = backbone.moveJobsToFolder(claimed, ["one"], "completed", { updated_at: 1770000000001 });
  assert.equal(completed.find((job) => job.id === "one").status, "completed");

  const pending = backbone.moveJobsToFolder(completed, ["two"], "pending_payment", { updated_at: 1770000000002 });
  const pendingJob = pending.find((job) => job.id === "two");
  assert.equal(pendingJob.status, "completed");
  assert.equal(pendingJob.payment_status, "Pending payment");
  assert.equal(pendingJob.completed_at, 1770000000002);
});

test("shared phone app text preserves detailed job timing and requirement fields", () => {
  const [job] = backbone.parseSharedJobs(
    [
      "Dollar General tobacco audit",
      "Store: Dollar General",
      "Address: 3075 Highway 41A S, Clarksville, TN 37043",
      "Pay: $49.50",
      "Due: Aug 28 6:00 PM",
      "Accepted: 9:04 AM",
      "Timer after accept: 240 minutes",
      "Time to complete: 50 minutes",
      "Photos required: 11",
      "Purchase required: No",
      "Requirements: audit 11 tobacco categories and upload photos",
      "Status: Accepted",
    ].join("\n"),
    "survey_merchandiser",
  );

  assert.equal(job.title, "Dollar General tobacco audit");
  assert.equal(job.location_name, "Dollar General");
  assert.match(job.address, /3075 Highway 41A S/i);
  assert.match(job.due, /Aug 28 6:00 PM/);
  assert.match(job.accepted_at, /9:04 AM/);
  assert.equal(job.timer_minutes, 240);
  assert.equal(job.minutes, 50);
  assert.equal(job.photos_required, 11);
  assert.equal(job.purchase_required, false);
  assert.match(job.requirements, /11 tobacco categories/i);
  assert.equal(job.status, "assigned");
});

test("passed jobs are normalized into the completed history bucket", () => {
  assert.equal(backbone.normalizeStatus("Passed"), "completed");
  assert.equal(backbone.normalizeStatus("Completed and paid"), "completed");
  assert.equal(backbone.isCompletedJob({ status: "passed" }), true);
  assert.equal(backbone.isCompletedJob({ status: "available" }), false);
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

  const point = backbone.coordinateForJob(job, routeFixture);
  assert.ok(point);
  assert.equal(point.source, "matched Nashville planner address");
  assert.equal(point.route, "23");
});

test("unmapped provider jobs keep source app distance and show unknown work time honestly", () => {
  const scored = backbone.scoreJob(
    {
      provider_id: "survey_merchandiser",
      title: "Tobacco Products Photo Audit",
      location_name: "Dollar General #2360",
      address: "3926 Lebanon Pike, Hermitage, TN 37076",
      pay_cents: 825,
      distance_miles: 11.4,
      duration_text: "Not visible in screen recording",
      status: "needs_completion",
    },
    routeFixture,
    null,
  );

  assert.equal(scored.distance_miles, 11.4);
  assert.equal(scored.minutes, undefined);
  assert.match(scored.recommendation_reason, /\$8\.25, work time not listed, 11\.4 mi from provider app/i);
  assert.equal(scored.duration_text, "Not visible in screen recording");
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
    routeFixture,
    origin,
  );

  assert.equal(recommended[0].title, "Better pay");
  assert.ok(recommended[0].recommendation_score > recommended[1].recommendation_score);
});
