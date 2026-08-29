"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTransitRouteSections } = require("../../shared/domain/transitRouteSections");
const {
  ALL_ACCESSIBLE_ROUTES,
  ALL_SELECTED_ROUTE_SECTIONS,
  buildTransitFilterState,
} = require("../../shared/domain/transitFilters");
const { createTransitFixture } = require("./transitFixtures");

function makeState(selection) {
  const fixture = createTransitFixture();
  return buildTransitFilterState({
    jobs: fixture.jobs,
    plans: fixture.plans,
    sections: buildTransitRouteSections(fixture),
    selection,
  });
}

test("all accessible routes includes every verified route connected to the selected plan", () => {
  const state = makeState({
    plan_id: "today",
    corridor_ids: [ALL_ACCESSIBLE_ROUTES],
    section_id: ALL_SELECTED_ROUTE_SECTIONS,
  });

  assert.deepEqual(
    state.corridors.map((corridor) => corridor.route_short_name),
    ["23", "53"],
  );
  assert.deepEqual(
    state.sections.map((section) => section.route_short_name),
    ["23", "53"],
  );
});

test("selecting Route 53 only exposes Route 53 sections and stops", () => {
  const state = makeState({
    plan_id: "today",
    corridor_ids: ["route-53"],
    section_id: ALL_SELECTED_ROUTE_SECTIONS,
  });

  assert.deepEqual(state.sections.map((section) => section.route_short_name), ["53"]);
  assert.deepEqual(
    state.stops.map((stop) => stop.stop_id),
    ["stop-53-start", "stop-53-end"],
  );
});

test("selecting one route section limits the route planner to jobs and stops in that section", () => {
  const allRoute53 = makeState({
    plan_id: "today",
    corridor_ids: ["route-53"],
    section_id: ALL_SELECTED_ROUTE_SECTIONS,
  });
  const route53Section = allRoute53.sections[0];
  const state = makeState({
    plan_id: "today",
    corridor_ids: ["route-53"],
    section_id: route53Section.id,
  });

  assert.deepEqual(state.jobs.map((job) => job.id), ["job-53"]);
  assert.deepEqual(state.stops.map((stop) => stop.stop_id), ["stop-53-start", "stop-53-end"]);
});

test("selecting one exact stop only retains jobs with explicit verified access to that stop", () => {
  const state = makeState({
    plan_id: "today",
    corridor_ids: ["route-53"],
    section_id: ALL_SELECTED_ROUTE_SECTIONS,
    stop_id: "stop-53-end",
  });

  assert.deepEqual(state.jobs.map((job) => job.id), ["job-53"]);
});
