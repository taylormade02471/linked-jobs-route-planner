const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const picker = require("../transit-picker.js");
const plannerDataSource = fs.readFileSync(path.join(__dirname, "..", "planner-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(plannerDataSource, context);
const data = context.window.PLANNER_DATA;
const planName = "Plan C — West + North/East";

test("all accessible routes includes every verified section in the selected plan", () => {
  const all = picker.selectedSectionKeys(data, planName, ["all-accessible-routes"]);
  assert.deepEqual(all, picker.planSectionKeys(data, planName));
});

test("a Route 23 corridor exposes only its verified section and stops", () => {
  const corridor = picker
    .corridorOptions(data, planName)
    .find((option) => option.routeNumbers.includes("23"));

  assert.ok(corridor);
  assert.deepEqual(picker.selectedSectionKeys(data, planName, [corridor.id]), [corridor.id]);
  assert.ok(
    picker
      .stopOptions(data, [corridor.id])
      .every((stop) => stop.id.startsWith("DIC") || stop.id.startsWith("MCC"))
  );
});

test("a route section limits the returned legs to that exact section", () => {
  const sectionId = picker.selectedSectionKeys(data, planName, ["dickerson"])[0];
  const legs = picker.legsForSelection(data, planName, ["dickerson"], "section:" + sectionId);

  assert.ok(legs.length > 0);
  assert.ok(legs.every((leg) => leg._section === sectionId));
});

test("an exact stop limits results to legs connected to that stop", () => {
  const stopId = "DICBENNF";
  const legs = picker.legsForSelection(data, planName, ["dickerson"], "stop:" + stopId);

  assert.ok(legs.length > 0);
  assert.ok(legs.every((leg) => leg.board === stopId || leg.alight === stopId));
});

test("corridor labels retain real route numbers and never generated ordinal labels", () => {
  const route23 = picker.corridorOptions(data, planName).find((option) => option.routeNumbers.includes("23"));

  assert.match(route23.label, /^Route 23 - /);
  assert.doesNotMatch(route23.label, /^\d+\./);
});

test("route leg metadata contains the required scheduled route details", () => {
  const leg = picker.legsForSelection(data, planName, ["dickerson"], "all-selected-route-sections")[0];
  const times = picker.scheduledWindow(leg.static);

  assert.ok(leg.board_stop.name);
  assert.ok(leg.alight_stop.name);
  assert.equal(times.pickup, "12:27 PM");
  assert.equal(times.exit, "12:45 PM");
  assert.ok(picker.jobWorkTime(data, leg));
});

test("unsupported sections never appear as verified transit sections", () => {
  const dataWithMissingStops = {
    plans: { Today: ["missing"] },
    sections: { missing: { title: "Missing route", legs: [{ route: "23" }] } },
  };

  assert.deepEqual(picker.planSectionKeys(dataWithMissingStops, "Today"), []);
});
