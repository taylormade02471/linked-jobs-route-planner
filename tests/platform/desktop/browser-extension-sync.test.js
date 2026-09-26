const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..", "..", "..");
const extensionRoot = path.join(projectRoot, "browser-extension");
const parser = require(path.join(extensionRoot, "jobslinger-parser.js"));
const providerJobs = require(path.join(projectRoot, "backend", "provider-jobs.js"));

test("MegaLog connector extracts a real job card and sends only safe fields", () => {
  const job = parser.parseMegaLogCard({
    index: 0,
    mapUrl:
      "https://maps.google.com/maps?saddr=370+Earl+Slate+Road&daddr=2805+WILMA+RUDOLPH+BLVD+CLARKSVILLE%2C+TN+37040",
    detailsUrl: "https://www.jobslingerplus.com/Info?id=sample-123",
    text: `Electronics Audit - Ipsos Insight
Survey: PC v2
2805 WILMA RUDOLPH BLVD
CLARKSVILLE, TN 37040
Due: 08/18
Submit Due: 08/18
Do not shop before: 08/03
Shop Pay: 16.00
Bonus: 0.00
Expenses: up to 0.00`,
  });

  assert.equal(job.provider_id, "jobslinger_megalog");
  assert.equal(job.provider_label, "JobSlinger MegaLog");
  assert.equal(job.address, "2805 WILMA RUDOLPH BLVD CLARKSVILLE, TN 37040");
  assert.equal(job.pay_cents, 1600);
  assert.equal(job.status, "available");
  assert.equal(job.due, "08/18");
  assert.match(job.requirements, /Survey: PC v2/);
  assert.equal(job.details_url, "https://www.jobslingerplus.com/Info?id=sample-123");
  assert.doesNotMatch(JSON.stringify(job), /password|cookie|session|token/i);

  const [safeJob] = providerJobs.normalizeIncomingProviderJobs([job]);
  assert.equal(safeJob.details_url, "https://www.jobslingerplus.com/Info?id=sample-123");
});

test("MegaLog instructions mentioning completion do not falsely complete an open job", () => {
  const openJob = parser.parseMegaLogCard({
    mapUrl: "https://maps.google.com/maps?daddr=2100+Lowes+Dr+Clarksville%2C+TN+37040",
    text: `Retail audit
Time to complete: 20 minutes
Complete all required photos before leaving
Shop Pay: 12.00`,
  });
  const completedJob = parser.parseMegaLogCard({
    mapUrl: "https://maps.google.com/maps?daddr=2823+Wilma+Rudolph+Blvd+Clarksville%2C+TN+37040",
    text: `Retail audit
Status: Completed
Shop Pay: 8.00`,
  });

  assert.equal(openJob.status, "available");
  assert.equal(completedJob.status, "completed");
});

test("MegaLog extension posts to the planner safe-provider channel every 30 minutes", () => {
  const content = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  const background = fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));

  assert.match(content, /30\s*\*\s*60\s*\*\s*1000/);
  assert.match(content, /MutationObserver/);
  assert.match(content, /chrome\.runtime\.sendMessage/);
  assert.match(background, /http:\/\/127\.0\.0\.1:3300\/api\/provider-jobs/);
  assert.match(background, /fetch\(SOURCE_URL/);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.content_scripts[0].js, ["jobslinger-parser.js", "content.js"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.jobslingerplus.com/MegaLog*"]);
});
