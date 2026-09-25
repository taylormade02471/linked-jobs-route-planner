const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const workAppBackbone = require("../work-app-backbone.js");

const plannerRoot = path.join(__dirname, "..");

function loadPlannerData() {
  const sandbox = { window: {} };
  const source = fs.readFileSync(path.join(plannerRoot, "planner-data.js"), "utf8");
  vm.runInNewContext(source, sandbox);
  return sandbox.window.PLANNER_DATA;
}

test("September 24 recording import contains all eight ready Clarksville jobs", () => {
  const data = loadPlannerData();
  const jobs = data.submittedJobs.filter((job) => job.import_batch === "recording-20260924-ready-eight");

  assert.equal(jobs.length, 8);
  assert.deepEqual(
    [...jobs.map((job) => String(job.store_number))].sort(),
    ["3495", "4469", "540", "544", "580", "673", "874", "959"].sort(),
  );
  assert.equal(jobs.reduce((total, job) => total + job.pay_cents, 0), 7750);
  assert.equal(jobs.filter((job) => job.authorization_required).length, 4);
  assert.ok(jobs.every((job) => job.status === "assigned"));
  assert.ok(jobs.every((job) => job.ready_state === "ready_to_start"));
  assert.ok(jobs.every((job) => Number.isInteger(job.due_at_ms)));
  assert.ok(jobs.every((job) => Number.isFinite(job.lat) && Number.isFinite(job.lon)));
  assert.equal(data.importMeta.latestImport.confirmedJobsVisible, 8);
});

test("phone planner foreground shows tomorrow's jobs without technical backend panels", () => {
  const html = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(html, /Tomorrow's 8 ready jobs/);
  assert.match(html, /Submitted jobs<strong>8<\/strong>/);
  assert.match(html, /id="jobTabAccepted" class="active"/);
  assert.match(html, /let activeJobTab='accepted'/);
  assert.match(
    html,
    /<section id="technicalConnections" hidden aria-hidden="true">[\s\S]*Public API \/ connection registry[\s\S]*Azure Key Vault connection plan[\s\S]*<\/section>/,
  );
  assert.match(
    html,
    /W\.mergePlannerSubmittedJobs\(workJobs,submitted,\{replaceIdPrefix:'recording-20260924-'\}\)/,
  );
  assert.match(html, /W\.archivePlannerJobsById\(workJobs,Object\.keys\(D\.jobs\|\|\{\}\)/);
  assert.match(html, /loadWorkJobs\(\);\s*moveExistingSavedJobsToCompletedOnce\(\);\s*mergeSubmittedJobsFromPlannerData\(\);/);
});

test("phone planner can build the current jobs into a furthest-first return route", () => {
  const html = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(html, /id="planFurthestFirstRoute"/);
  assert.match(html, /route-planner-core\.js/);
  assert.match(html, /planFurthestFirstReturnSweep/);
  assert.match(html, /CLARKSVILLE_LUNCH_STOP/);
  assert.match(html, /RideCTS/);
});

test("recording batch refresh removes stale cards while preserving user job state", () => {
  const currentJob = {
    id: "recording-20260924-kroger-540-lunch-bowls",
    title: "Correct current title",
    pay_cents: 1200,
    status: "assigned",
    payment_status: "unpaid",
  };
  const existing = [
    {
      id: "recording-20260924-kroger-540-lunch-bowls",
      title: "Old cached title",
      pay_cents: 0,
      status: "completed",
      payment_status: "Pending payment",
      completed_at: 1790000000000,
    },
    { id: "recording-20260924-noodle-kroger-0544", title: "Stale wrong card" },
    { id: "older-saved-job", title: "Keep older history", status: "completed" },
  ];

  const merged = workAppBackbone.mergePlannerSubmittedJobs(existing, [currentJob], {
    replaceIdPrefix: "recording-20260924-",
  });

  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, "Correct current title");
  assert.equal(merged[0].pay_cents, 1200);
  assert.equal(merged[0].status, "completed");
  assert.equal(merged[0].payment_status, "Pending payment");
  assert.equal(merged[0].completed_at, 1790000000000);
  assert.equal(merged[1].id, "older-saved-job");
});

test("historical planner jobs move to completed without removing current assignments", () => {
  const jobs = [
    { id: "old-august-job", status: "assigned", title: "Keep in history" },
    { id: "recording-20260924-current", status: "assigned", title: "Tomorrow" },
    { id: "already-complete", status: "completed", completed_at: 100, title: "Already done" },
  ];

  const archived = workAppBackbone.archivePlannerJobsById(
    jobs,
    ["old-august-job", "already-complete"],
    { completed_at: 200 },
  );

  assert.equal(archived.length, 3);
  assert.equal(archived[0].status, "completed");
  assert.equal(archived[0].completed_at, 200);
  assert.equal(archived[1].status, "assigned");
  assert.equal(archived[2].status, "completed");
  assert.equal(archived[2].completed_at, 100);
});
