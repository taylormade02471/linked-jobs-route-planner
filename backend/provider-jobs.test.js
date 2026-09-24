const assert = require("node:assert/strict");
const test = require("node:test");

const providerJobs = require("./provider-jobs.js");

test("safe provider sync keeps open assigned and needs-completion jobs without credentials", () => {
  const incoming = providerJobs.normalizeIncomingProviderJobs([
    {
      provider_id: "survey_merchandiser",
      external_id: "sm-1",
      title: "Open audit",
      status: "available",
      pay_cents: 1850,
      distance_miles: 11.4,
      duration_text: "Not visible in screen recording",
      ready_state: "ready_to_start",
      source_video: "Screen_Recording_20260828_130331.mp4",
      password: "do-not-sync",
      access_token: "do-not-sync",
      source_text: "raw screen text can contain too much detail",
    },
    {
      provider_id: "field_nation",
      external_id: "fn-2",
      title: "Accepted visit",
      status: "assigned",
      address: "1801 Madison St, Clarksville, TN",
      due: "Today 5:00 PM",
    },
    {
      provider_id: "field_agent",
      external_id: "fa-3",
      title: "Late shop",
      status: "needs completion",
    },
  ]);

  assert.equal(incoming.length, 3);
  assert.deepEqual(incoming.map((job) => job.status), ["available", "assigned", "needs_completion"]);
  assert.equal(incoming[0].distance_miles, 11.4);
  assert.equal(incoming[0].duration_text, "Not visible in screen recording");
  assert.equal(incoming[0].ready_state, "ready_to_start");
  assert.equal(incoming[0].source_video, "Screen_Recording_20260828_130331.mp4");
  assert.equal(incoming[1].minutes, undefined);
  assert.equal(JSON.stringify(incoming).includes("do-not-sync"), false);
  assert.equal(JSON.stringify(incoming).includes("raw screen text"), false);
});

test("safe provider sync stores completed jobs but excludes them from route-visible filtering", () => {
  const incoming = providerJobs.normalizeIncomingProviderJobs([
    { provider_id: "clickworker", title: "Claim now", status: "open" },
    { provider_id: "field_agent", title: "Apply first", status: "apply required" },
    { provider_id: "survey_merchandiser", title: "Paid old task", status: "paid" },
  ]);

  assert.deepEqual(incoming.map((job) => job.title), ["Claim now", "Paid old task"]);
  assert.deepEqual(incoming.map((job) => job.status), ["available", "completed"]);
  assert.deepEqual(providerJobs.filterProviderJobs(incoming, { status: "route_visible" }).map((job) => job.title), [
    "Claim now",
  ]);
  assert.deepEqual(providerJobs.filterProviderJobs(incoming, { status: "completed" }).map((job) => job.title), [
    "Paid old task",
  ]);
});

test("provider jobs can be upserted and filtered by all apps one app and status", () => {
  const existing = [{ id: "survey_merchandiser:sm-1", provider_id: "survey_merchandiser", title: "Old title", status: "available" }];
  const incoming = providerJobs.normalizeIncomingProviderJobs([
    { provider_id: "survey_merchandiser", external_id: "sm-1", title: "New title", status: "available" },
    { provider_id: "field_nation", external_id: "fn-1", title: "Accepted", status: "assigned" },
    { provider_id: "field_agent", external_id: "fa-1", title: "Risky", status: "needs completion" },
  ]);

  const merged = providerJobs.upsertProviderJobs(existing, incoming);

  assert.equal(merged.length, 3);
  assert.equal(merged.find((job) => job.id === "survey_merchandiser:sm-1").title, "New title");
  assert.deepEqual(providerJobs.filterProviderJobs(merged, { provider: "all" }).map((job) => job.title), [
    "New title",
    "Accepted",
    "Risky",
  ]);
  assert.deepEqual(providerJobs.filterProviderJobs(merged, { provider: "field_nation" }).map((job) => job.title), ["Accepted"]);
  assert.deepEqual(providerJobs.filterProviderJobs(merged, { status: "needs_completion" }).map((job) => job.title), ["Risky"]);
});
