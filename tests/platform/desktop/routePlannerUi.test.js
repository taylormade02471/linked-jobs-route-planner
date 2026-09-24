const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const plannerRoot = path.join(__dirname, "..", "..", "..", "nashville-live-planner");

test("desktop planner renders the full job carousel and keeps the route cap at 20 stops", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /#appRecommendations\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(280px,1fr\)\);overflow:visible/);
  assert.match(index, /visible\.map\(/);
  assert.doesNotMatch(index, /visible\.slice\(0,24\)/);
  assert.match(index, /navigationJobs\(\)\.slice\(0,20\)/);
  assert.doesNotMatch(index, /navigationJobs\(\)\.slice\(0,10\)/);
  assert.match(index, /A route can contain at most 20 stops/);
});

test("desktop planner surfaces a floating needs-completion overlay above the rest of the cards", () => {
  const index = fs.readFileSync(path.join(plannerRoot, "index.html"), "utf8");

  assert.match(index, /Needed Jobs to Complete/);
  assert.match(index, /priorityJobs/);
  assert.match(index, /position:sticky/);
  assert.match(index, /priority overlay/i);
  assert.match(index, /needs completion first/i);
});
