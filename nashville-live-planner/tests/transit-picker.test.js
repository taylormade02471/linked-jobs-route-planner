const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const picker = require("../transit-picker.js");
const plannerDataSource = fs.readFileSync(path.join(__dirname, "..", "planner-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(plannerDataSource, context);
const productionData = context.window.PLANNER_DATA;
const planName = "Plan C — West + North/East";
const data = {
  jobs: {
    Q11: { name: "Fixture job", address: "3019 Dickerson Pike, Nashville, TN", minutes: 5 },
  },
  plans: {
    [planName]: ["dickerson"],
  },
  sections: {
    dickerson: {
      title: "Dickerson / Maplewood",
      legs: [
        {
          label: "Route 23 to 3019 Dickerson Pike",
          route: "23",
          board: "MCC4_24",
          alight: "DICBENNF",
          destination: "3019 Dickerson Pike, Nashville, TN",
          job: "Q11",
          static: "Example GTFS window 12:27 PM → 12:45 PM when this section begins near noon",
          board_stop: { name: "CENTRAL 4TH AVE - BAY 24", lat: 36.16682, lon: -86.78131 },
          alight_stop: { name: "DICKERSON PIKE & BEN ALLEN RD NB", lat: 36.225551, lon: -86.760196 },
          segment: [[36.16682, -86.78131], [36.225551, -86.760196]],
        },
      ],
    },
  },
};

test("production Nashville planner exposes the current safe video-imported jobs", () => {
  assert.equal(Object.keys(productionData.jobs || {}).length, 74);
  assert.match(productionData.source, /Screen_Recording_20260827_233541\.mp4/);
  assert.deepEqual(picker.planSectionKeys(productionData, "No posted jobs"), []);
  assert.ok(
    Object.values(productionData.jobs).every((job) =>
      Object.keys(job).every((field) => !/(password|token|secret|cookie|session|source_text)/i.test(field)),
    ),
  );
  assert.equal(productionData.jobs["DG-2360"].name, "Dollar General Store #2360");
});

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
