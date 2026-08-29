const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildJobBoardSummaries,
  identifyProviderByUrl,
  isOpenAvailableJob,
} = require("../../shared/domain/providers");

test("available board jobs exclude planned submitted paid and completed work", () => {
  const jobs = [
    { id: "1", provider_id: "field_nation", title: "Open", status: "active" },
    { id: "2", provider_id: "field_nation", title: "Available", workflow_status: "available" },
    { id: "3", provider_id: "field_nation", title: "Planned", status: "planned" },
    { id: "4", provider_id: "field_nation", title: "Submitted", status: "submitted" },
    { id: "5", provider_id: "field_nation", title: "Paid", status: "paid" },
  ];

  assert.deepEqual(jobs.filter(isOpenAvailableJob).map((job) => job.id), ["1", "2"]);
});

test("job board summaries show linked boards and open unapplied counts", () => {
  const summaries = buildJobBoardSummaries({
    jobs: [
      { id: "1", provider_id: "field_nation", status: "active", lat: 36.1, lng: -86.7 },
      { id: "2", provider_id: "field_nation", status: "awaiting_payment" },
      { id: "3", source_url: "https://fieldnation.com/", status: "available" },
    ],
    sourceStatus: {
      state: "live",
      lastScrapeAt: "2026-08-21T15:00:00.000Z",
      pageUrl: "https://fieldnation.com/",
    },
  });

  const fieldNation = summaries.find((summary) => summary.provider_id === "field_nation");
  assert.equal(fieldNation.display_name, "Field Nation");
  assert.equal(fieldNation.open_available_count, 2);
  assert.equal(fieldNation.total_seen_count, 3);
  assert.equal(fieldNation.mapped_available_count, 1);
  assert.equal(fieldNation.connection_state, "live");
});

test("provider detection uses verified linked job-board domains", () => {
  assert.equal(identifyProviderByUrl("https://fieldnation.com/").provider_id, "field_nation");
  assert.equal(identifyProviderByUrl("https://workplace.clickworker.com/").provider_id, "clickworker");
  assert.equal(identifyProviderByUrl("https://support.survey.com/hc/en-us").provider_id, "survey_merchandiser");
  assert.equal(identifyProviderByUrl("https://unknown.example/jobs"), null);
});

test("target linked providers are the phone work apps instead of Jobslinger", () => {
  const summaries = buildJobBoardSummaries({ jobs: [] });
  assert.deepEqual(
    summaries.map((summary) => summary.provider_id),
    ["survey_merchandiser", "clickworker", "field_nation"],
  );
  assert.ok(summaries.every((summary) => summary.connection_state === "needs phone connection"));
});
