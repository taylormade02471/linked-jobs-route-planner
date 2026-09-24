const assert = require("node:assert/strict");
const test = require("node:test");

const connectors = require("../provider-connectors.js");

test("connector registry exposes each requested work app and generic OCR intake", () => {
  assert.deepEqual(
    connectors.PROVIDER_CONNECTORS.map((connector) => connector.id),
    ["survey_merchandiser", "clickworker", "field_nation", "field_agent", "generic_ocr"],
  );

  assert.ok(connectors.connectorById("survey_merchandiser").supports_assigned_jobs);
  assert.ok(connectors.connectorById("clickworker").supports_available_jobs);
  assert.ok(connectors.connectorById("field_nation").supports_assigned_jobs);
  assert.ok(connectors.connectorById("field_agent").supports_available_jobs);
  assert.equal(connectors.connectorById("generic_ocr").intake_type, "screenshot_or_pdf");
});

test("Survey Merchandiser connector reads full available job details", () => {
  const [job] = connectors.parseProviderText(
    "survey_merchandiser",
    [
      "Survey Merchandiser",
      "Dollar General tobacco audit",
      "Store: Dollar General",
      "Address: 3075 Highway 41A S, Clarksville, TN 37043",
      "Pay: $49.50",
      "Due: Aug 28 6:00 PM",
      "Time to complete: 50 minutes",
      "Timer after accept: 240 minutes",
      "Photos required: 11",
      "Purchase required: No",
      "Status: Available",
    ].join("\n"),
  );

  assert.equal(job.provider_id, "survey_merchandiser");
  assert.equal(job.title, "Dollar General tobacco audit");
  assert.equal(job.location_name, "Dollar General");
  assert.match(job.address, /3075 Highway 41A S/);
  assert.equal(job.pay_cents, 4950);
  assert.match(job.due, /Aug 28 6:00 PM/);
  assert.equal(job.minutes, 50);
  assert.equal(job.timer_minutes, 240);
  assert.equal(job.photos_required, 11);
  assert.equal(job.purchase_required, false);
  assert.equal(job.status, "available");
});

test("Field Nation connector keeps accepted jobs for yellow or red map display", () => {
  const [job] = connectors.parseProviderText(
    "field_nation",
    [
      "Field Nation Work Order #88421",
      "Router swap",
      "Location: 1801 Madison St, Clarksville, TN",
      "Pay $85.00",
      "Assigned",
      "Start by: Today 3:00 PM",
      "Complete by: Today 5:00 PM",
      "Estimated duration: 90 minutes",
      "Requirements: upload arrival photo and completion notes",
    ].join("\n"),
  );

  assert.equal(job.provider_id, "field_nation");
  assert.equal(job.external_id, "88421");
  assert.equal(job.status, "assigned");
  assert.match(job.address, /1801 Madison St/);
  assert.equal(job.pay_cents, 8500);
  assert.match(job.due, /Today 5:00 PM/);
  assert.equal(job.minutes, 90);
  assert.match(job.requirements, /arrival photo/);
});

test("Clickworker and Field Agent connectors exclude apply-only work but keep claim-now work", () => {
  const jobs = [
    ...connectors.parseProviderText(
      "clickworker",
      "Clickworker\nRetail photo task\n7601 Hwy 70 S, Nashville, TN 37221\nFee $12.00\nOpen to claim\nDuration 20 minutes",
    ),
    ...connectors.parseProviderText(
      "field_agent",
      "Field Agent\nMystery shop\n3019 Dickerson Pike, Nashville, TN\nReward $18.00\nApply required\n30 minutes",
    ),
  ];

  assert.equal(jobs[0].provider_id, "clickworker");
  assert.equal(jobs[0].status, "available");
  assert.equal(jobs[1].provider_id, "field_agent");
  assert.equal(jobs[1].status, "applied");
  assert.deepEqual(connectors.routeVisibleJobs(jobs).map((job) => job.provider_id), ["clickworker"]);
});

test("generic OCR importer accepts image and PDF intake as pending extraction", () => {
  const image = connectors.createGenericOcrIntake({ mime_type: "image/png", uri: "content://screen.png" });
  const pdf = connectors.createGenericOcrIntake({ mime_type: "application/pdf", uri: "content://jobs.pdf" });

  assert.equal(image.status, "needs_ocr");
  assert.equal(image.kind, "screenshot");
  assert.equal(pdf.status, "needs_ocr");
  assert.equal(pdf.kind, "pdf");
});
