const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_STOPS,
  normalizeStopIds,
  orderStopsByFeasibility,
  collectVerifiedRoutes,
  collectPlanJobIds,
  buildGuidance,
} = require("../../nashville-live-planner/route-planner-core.js");

const data = {
  jobs: {
    A: { name: "A", address: "First", lat: 36.1, lng: -86.8 },
    B: { name: "B", address: "Second", lat: 36.2, lng: -86.7 },
    C: { name: "C", address: "Third", lat: 36.3, lng: -86.6 },
  },
  sections: {
    dickerson: {
      title: "Dickerson / Maplewood",
      legs: [{ route: "23", job: "A", board_stop: { name: "Central", lat: 36.1, lon: -86.8 }, alight_stop: { name: "Dickerson", lat: 36.2, lon: -86.7 } }],
    },
    gallatin: {
      title: "Madison / Gallatin",
      legs: [{ route: "56", job: "B", board_stop: { name: "Central", lat: 36.1, lon: -86.8 }, alight_stop: { name: "Gallatin", lat: 36.3, lon: -86.6 } }],
    },
  },
  plans: { "Plan C": ["dickerson", "gallatin"] },
  routeColors: { "23": "#522D80", "56": "#ED1C24" },
  routeIdToShort: { "23": "23", "56": "56" },
};

test("limits a custom plan to 20 unique stops", () => {
  const ids = Array.from({ length: 24 }, (_, index) => `job-${index}`);
  assert.deepEqual(normalizeStopIds([...ids, "job-0"]), ids.slice(0, MAX_STOPS), "only the first 20 unique stops are retained");
});

test("orders selected stops from the chosen origin without inventing stops", () => {
  const ordered = orderStopsByFeasibility(
    [
      { id: "far", lat: 36.3, lng: -86.6 },
      { id: "near", lat: 36.11, lng: -86.81 },
    ],
    { lat: 36.1, lng: -86.8 }
  );
  assert.deepEqual(ordered.map((stop) => stop.id), ["near", "far"]);
});

test("exposes only routes that have verified route legs and stops", () => {
  const routes = collectVerifiedRoutes(data);
  assert.deepEqual(routes.map((route) => route.shortName), ["23", "56"]);
  assert.match(routes[0].corridors.join(" "), /Dickerson/);
});

test("plan selection returns jobs from its real sections", () => {
  assert.deepEqual(collectPlanJobIds(data, "Plan C"), ["A", "B"]);
});

test("guidance clearly reports the next verified target and distance", () => {
  const guidance = buildGuidance(
    { lat: 36.1, lng: -86.8 },
    { name: "Dickerson Pike", lat: 36.11, lng: -86.8 }
  );
  assert.equal(guidance.targetName, "Dickerson Pike");
  assert.ok(guidance.distanceMiles > 0);
  assert.match(guidance.instruction, /Dickerson Pike/);
});
