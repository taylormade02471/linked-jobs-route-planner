const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const plannerRoot = path.join(__dirname, "..", "..", "..", "nashville-live-planner");

test("desktop planner renders the full job carousel and keeps the route cap at 20 stops", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /#appRecommendations\{display:grid;grid-auto-flow:column/);
  assert.match(index, /scroll-snap-type:x proximity/);
  assert.match(index, /visible\.map\(/);
  assert.doesNotMatch(index, /visible\.slice\(0,24\)/);
  assert.match(index, /navigationJobs\(\)\.slice\(0,20\)/);
  assert.doesNotMatch(index, /navigationJobs\(\)\.slice\(0,10\)/);
  assert.match(index, /A route can contain at most 20 stops/);
});
