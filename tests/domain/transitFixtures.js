"use strict";

function createTransitFixture() {
  return {
    source: {
      type: "static_gtfs",
      verified: true,
    },
    routes: [
      {
        route_id: "route-23",
        route_short_name: "23",
        route_long_name: "Dickerson Pike corridor",
      },
      {
        route_id: "route-53",
        route_short_name: "53",
        route_long_name: "Gallatin / Madison corridor",
      },
    ],
    trips: [
      {
        route_id: "route-23",
        service_id: "weekday",
        trip_id: "trip-23-northbound",
        direction_id: "0",
        trip_headsign: "Northbound",
        shape_id: "shape-23",
      },
      {
        route_id: "route-53",
        service_id: "weekday",
        trip_id: "trip-53-northbound",
        direction_id: "0",
        trip_headsign: "Northbound",
        shape_id: "shape-53",
      },
    ],
    stops: [
      {
        stop_id: "stop-23-start",
        stop_name: "Dickerson Pike & Trinity Ln",
        stop_desc: "Dickerson Pike at Trinity Lane",
        stop_lat: "36.2050",
        stop_lon: "-86.7680",
      },
      {
        stop_id: "stop-23-end",
        stop_name: "Dickerson Pike & Bellshire Dr",
        stop_desc: "Dickerson Pike at Bellshire Drive",
        stop_lat: "36.2470",
        stop_lon: "-86.7600",
      },
      {
        stop_id: "stop-53-start",
        stop_name: "Gallatin Pike & Eastland Ave",
        stop_desc: "Gallatin Pike at Eastland Avenue",
        stop_lat: "36.1840",
        stop_lon: "-86.7470",
      },
      {
        stop_id: "stop-53-end",
        stop_name: "Gallatin Pike & Madison Station",
        stop_desc: "Gallatin Pike at Madison Station",
        stop_lat: "36.2590",
        stop_lon: "-86.7150",
      },
    ],
    stop_times: [
      {
        trip_id: "trip-23-northbound",
        arrival_time: "08:10:00",
        departure_time: "08:10:00",
        stop_id: "stop-23-start",
        stop_sequence: "1",
      },
      {
        trip_id: "trip-23-northbound",
        arrival_time: "08:29:00",
        departure_time: "08:29:00",
        stop_id: "stop-23-end",
        stop_sequence: "2",
      },
      {
        trip_id: "trip-53-northbound",
        arrival_time: "08:15:00",
        departure_time: "08:15:00",
        stop_id: "stop-53-start",
        stop_sequence: "1",
      },
      {
        trip_id: "trip-53-northbound",
        arrival_time: "08:38:00",
        departure_time: "08:38:00",
        stop_id: "stop-53-end",
        stop_sequence: "2",
      },
    ],
    plans: [
      {
        id: "today",
        label: "Today's Jobs",
        job_ids: ["job-23", "job-53"],
      },
    ],
    jobs: [
      {
        id: "job-23",
        title: "Dickerson Pike shop",
        address: "Dickerson Pike & Bellshire Drive, Nashville, TN",
        plan_ids: ["today"],
        transit_access: {
          route_ids: ["route-23"],
          section_ids: ["route-23:0:stop-23-start:stop-23-end"],
          stop_ids: ["stop-23-end"],
          walk_time_minutes: 8,
          job_work_time_minutes: 45,
          buffer_risk_label: "Comfortable buffer",
        },
      },
      {
        id: "job-53",
        title: "Madison Station shop",
        address: "Gallatin Pike & Madison Station, Nashville, TN",
        plan_ids: ["today"],
        transit_access: {
          route_ids: ["route-53"],
          section_ids: ["route-53:0:stop-53-start:stop-53-end"],
          stop_ids: ["stop-53-end"],
          walk_time_minutes: 7,
          job_work_time_minutes: 30,
          buffer_risk_label: "Low risk",
        },
      },
    ],
  };
}

module.exports = {
  createTransitFixture,
};
