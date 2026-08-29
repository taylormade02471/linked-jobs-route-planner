"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTransitRouteSections,
  findScheduledTransitLeg,
  formatRouteLegDisplay,
} = require("../../shared/domain/transitRouteSections");
const { createTransitFixture } = require("./transitFixtures");

test("verified GTFS sections preserve real route names, corridors, stops, and direction", () => {
  const fixture = createTransitFixture();
  const sections = buildTransitRouteSections(fixture);

  assert.deepEqual(
    sections.map((section) => section.route_short_name).sort(),
    ["23", "53"],
  );

  const route53 = sections.find((section) => section.route_id === "route-53");
  assert.equal(route53.route_label, "Route 53 - Gallatin / Madison corridor");
  assert.equal(
    route53.label,
    "Gallatin Pike & Eastland Ave -> Gallatin Pike & Madison Station",
  );
  assert.equal(route53.direction, "Northbound");
  assert.equal(route53.start_stop.location, "Gallatin Pike at Eastland Avenue");
  assert.equal(route53.end_stop.location, "Gallatin Pike at Madison Station");
  assert.equal(route53.source_label, "Scheduled estimate");
});

test("missing verified GTFS stop data produces no invented route sections", () => {
  const fixture = createTransitFixture();
  fixture.stops = [];

  assert.deepEqual(buildTransitRouteSections(fixture), []);
});

test("repeated GTFS trips share one real route section while retaining their trip IDs", () => {
  const fixture = createTransitFixture();
  fixture.trips.push({
    route_id: "route-53",
    service_id: "weekday",
    trip_id: "trip-53-later",
    direction_id: "0",
    trip_headsign: "Northbound",
    shape_id: "shape-53",
  });
  fixture.stop_times.push(
    {
      trip_id: "trip-53-later",
      arrival_time: "09:15:00",
      departure_time: "09:15:00",
      stop_id: "stop-53-start",
      stop_sequence: "1",
    },
    {
      trip_id: "trip-53-later",
      arrival_time: "09:38:00",
      departure_time: "09:38:00",
      stop_id: "stop-53-end",
      stop_sequence: "2",
    },
  );

  const sections = buildTransitRouteSections(fixture).filter((section) => section.route_id === "route-53");
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].trip_ids, ["trip-53-northbound", "trip-53-later"]);
});

test("a transit leg exists only when the verified trip connects the requested boarding and exit stops", () => {
  const fixture = createTransitFixture();
  const leg = findScheduledTransitLeg({
    ...fixture,
    origin_stop_ids: ["stop-53-start"],
    destination_stop_ids: ["stop-53-end"],
    route_ids: ["route-53"],
  });

  assert.equal(leg.route_short_name, "53");
  assert.equal(leg.trip_id, "trip-53-northbound");
  assert.equal(leg.scheduled_pickup_time, "08:15:00");
  assert.equal(leg.scheduled_dropoff_time, "08:38:00");
  assert.equal(
    findScheduledTransitLeg({
      ...fixture,
      origin_stop_ids: ["stop-53-start"],
      destination_stop_ids: ["stop-23-end"],
      route_ids: ["route-53"],
    }),
    null,
  );
});

test("route leg display exposes every planning field with a static schedule source label", () => {
  const display = formatRouteLegDisplay({
    route_short_name: "53",
    direction: "Northbound",
    board_stop: {
      name: "Gallatin Pike & Eastland Ave",
      location: "Gallatin Pike at Eastland Avenue",
    },
    scheduled_pickup_time: "08:15:00",
    exit_stop: {
      name: "Gallatin Pike & Madison Station",
      location: "Gallatin Pike at Madison Station",
    },
    walk_time_minutes: 7,
    job_work_time_minutes: 30,
    buffer_risk_label: "Low risk",
    source_label: "Scheduled estimate",
  });

  assert.deepEqual(display, {
    route_number: "53",
    direction: "Northbound",
    boarding_stop_name: "Gallatin Pike & Eastland Ave",
    boarding_stop_location: "Gallatin Pike at Eastland Avenue",
    scheduled_pickup_time: "08:15:00",
    exit_stop_name: "Gallatin Pike & Madison Station",
    exit_stop_location: "Gallatin Pike at Madison Station",
    walk_time_minutes: 7,
    job_work_time_minutes: 30,
    buffer_risk_label: "Low risk",
    source_label: "Scheduled estimate",
  });
});
