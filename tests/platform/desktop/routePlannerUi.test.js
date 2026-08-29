"use strict";

const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");

const { formatRouteLegDisplay } = require("../../../shared/domain/transitRouteSections");

test("desktop route planner contains the three-level verified transit picker", async () => {
  const html = await fs.readFile("frontend/index.html", "utf8");
  const app = await fs.readFile("frontend/app.js", "utf8");

  assert.match(html, /id="planOptionSelect"/);
  assert.match(html, /id="corridorSelect"/);
  assert.match(html, /id="routeSectionSelect"/);
  assert.match(html, /All accessible routes in this plan/);
  assert.match(html, /All selected route sections/);
  assert.match(html, /All stops selected/);
  assert.match(app, /details\.route_number/);
  assert.doesNotMatch(app, /Route \$\{index \+ 1\}/);
});

test("desktop route planner auto-syncs jobs and fixes legacy CTS feed ids", async () => {
  const app = await fs.readFile("frontend/app.js", "utf8");

  assert.match(app, /function normalizeStoredOnestopId/);
  assert.match(app, /f-clarksville~tn~us/);
  assert.match(app, /o-clarksville~tn~us/);
  assert.match(app, /new EventSource\(\"\/api\/events\"\)/);
  assert.match(app, /addEventListener\(\"jobs\"/);
  assert.match(app, /initializeApp\(\)/);
  assert.match(app, /autoPlanRoute\(\)/);
});

test("android manifest declares only required location network and explicit share types", async () => {
  const manifest = await fs.readFile("android/app/src/main/AndroidManifest.xml", "utf8");

  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(manifest, /android\.intent\.action\.SEND_MULTIPLE/);
  assert.match(manifest, /android:mimeType="text\/plain"/);
  assert.match(manifest, /android:mimeType="image\/jpeg"/);
  assert.match(manifest, /android:mimeType="image\/png"/);
  assert.match(manifest, /android:mimeType="application\/pdf"/);
  assert.doesNotMatch(manifest, /android:mimeType="\*\/\*"/);
});

test("desktop route result data keeps actual route identifiers and required planning details", () => {
  const display = formatRouteLegDisplay({
    route_short_name: "23",
    direction: "Northbound",
    board_stop: { name: "Dickerson Pike & Trinity Ln", location: "Dickerson Pike at Trinity Lane" },
    scheduled_pickup_time: "08:10:00",
    exit_stop: { name: "Dickerson Pike & Bellshire Dr", location: "Dickerson Pike at Bellshire Drive" },
    walk_time_minutes: 8,
    job_work_time_minutes: 45,
    buffer_risk_label: "Comfortable buffer",
    source_label: "Scheduled estimate",
  });

  assert.equal(display.route_number, "23");
  assert.equal(display.boarding_stop_name, "Dickerson Pike & Trinity Ln");
  assert.equal(display.boarding_stop_location, "Dickerson Pike at Trinity Lane");
  assert.equal(display.scheduled_pickup_time, "08:10:00");
  assert.equal(display.exit_stop_name, "Dickerson Pike & Bellshire Dr");
  assert.equal(display.exit_stop_location, "Dickerson Pike at Bellshire Drive");
  assert.equal(display.walk_time_minutes, 8);
  assert.equal(display.job_work_time_minutes, 45);
  assert.equal(display.source_label, "Scheduled estimate");
});
