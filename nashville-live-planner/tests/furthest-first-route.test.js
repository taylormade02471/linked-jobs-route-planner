const test = require("node:test");
const assert = require("node:assert/strict");

const RoutePlannerCore = require("../route-planner-core.js");

test("furthest-first return sweep starts at the outer job area and works inward", () => {
  const origin = { lat: 36.55, lon: -87.34, label: "Current location" };
  const plan = RoutePlannerCore.planFurthestFirstReturnSweep(
    [
      { id: "near", name: "Near job", lat: 36.57, lon: -87.34 },
      { id: "middle", name: "Middle job", lat: 36.68, lon: -87.34 },
      { id: "outer", name: "Outer job", lat: 36.78, lon: -87.34 },
    ],
    origin,
    {
      lunchStop: { id: "lunch", name: "Lunch", lat: 36.62, lon: -87.34, kind: "lunch" },
    },
  );

  assert.equal(plan.mode, "furthest_first_return_sweep");
  assert.equal(plan.requiresTransitVerification, true);
  assert.deepEqual(plan.stops.map((stop) => stop.id), ["outer", "middle", "lunch", "near"]);
  assert.equal(plan.stops[0].sequence, 1);
  assert.equal(plan.stops.at(-1).id, "near");
  assert.ok(plan.totalMapMiles > 0);
  assert.equal(plan.returnPoint.label, "Current location");
});
