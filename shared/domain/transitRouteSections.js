"use strict";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopSequence(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function scheduleSourceLabel(source = {}) {
  const label = asText(source.source_label || source.label);
  const type = asText(source.type || source.kind).toLowerCase();
  if (label === "Live verified" || type === "live_verified" || source.live_verified === true) {
    return "Live verified";
  }
  return "Scheduled estimate";
}

function routeLabel(route = {}) {
  const shortName = asText(route.route_short_name || route.short_name);
  const longName = asText(route.route_long_name || route.long_name);
  if (!shortName) return "";
  return longName ? `Route ${shortName} - ${longName}` : `Route ${shortName}`;
}

function directionLabel(trip = {}) {
  const explicit = asText(
    trip.direction_name || trip.trip_headsign || trip.headsign || trip.direction,
  );
  if (explicit) return explicit;
  const directionId = asText(trip.direction_id);
  return directionId ? `Direction ${directionId}` : "";
}

function normalizeStop(stop = {}) {
  const stopId = asText(stop.stop_id || stop.id);
  const name = asText(stop.stop_name || stop.name);
  if (!stopId || !name) return null;

  return {
    stop_id: stopId,
    name,
    location: asText(
      stop.cross_street || stop.location || stop.stop_desc || stop.desc || stop.stop_code || stop.code,
    ),
    lat: finiteNumber(stop.stop_lat ?? stop.lat),
    lon: finiteNumber(stop.stop_lon ?? stop.lon ?? stop.lng),
    code: asText(stop.stop_code || stop.code),
  };
}

function displayStop(stop = {}) {
  return {
    name: asText(stop.stop_name || stop.name),
    location: asText(
      stop.cross_street || stop.location || stop.stop_desc || stop.desc || stop.stop_code || stop.code,
    ),
  };
}

function sectionIdFor({ route_id, direction_id, direction, start_stop_id, end_stop_id }) {
  const directionKey = asText(direction_id) || asText(direction) || "unspecified";
  return [route_id, directionKey, start_stop_id, end_stop_id].map(asText).join(":");
}

function buildScheduleIndex(input = {}) {
  const routesById = new Map();
  for (const route of asArray(input.routes)) {
    const routeId = asText(route?.route_id || route?.id);
    const shortName = asText(route?.route_short_name || route?.short_name);
    if (!routeId || !shortName) continue;
    routesById.set(routeId, {
      route_id: routeId,
      route_short_name: shortName,
      route_long_name: asText(route?.route_long_name || route?.long_name),
    });
  }

  const tripsById = new Map();
  for (const trip of asArray(input.trips)) {
    const tripId = asText(trip?.trip_id || trip?.id);
    const routeId = asText(trip?.route_id);
    if (!tripId || !routesById.has(routeId)) continue;
    tripsById.set(tripId, {
      trip_id: tripId,
      route_id: routeId,
      direction_id: asText(trip?.direction_id),
      direction_name: asText(trip?.direction_name),
      trip_headsign: asText(trip?.trip_headsign || trip?.headsign),
      shape_id: asText(trip?.shape_id),
    });
  }

  const stopsById = new Map();
  for (const stop of asArray(input.stops)) {
    const normalized = normalizeStop(stop);
    if (normalized) stopsById.set(normalized.stop_id, normalized);
  }

  const stopTimesByTrip = new Map();
  for (const rawStopTime of asArray(input.stop_times || input.stopTimes)) {
    const tripId = asText(rawStopTime?.trip_id);
    const stopId = asText(rawStopTime?.stop_id);
    const sequence = stopSequence(rawStopTime?.stop_sequence);
    if (!tripsById.has(tripId) || !stopsById.has(stopId) || sequence === null) continue;

    const item = {
      trip_id: tripId,
      stop_id: stopId,
      stop_sequence: sequence,
      arrival_time: asText(rawStopTime?.arrival_time),
      departure_time: asText(rawStopTime?.departure_time),
    };
    const list = stopTimesByTrip.get(tripId) || [];
    list.push(item);
    stopTimesByTrip.set(tripId, list);
  }

  for (const rows of stopTimesByTrip.values()) {
    rows.sort((left, right) => left.stop_sequence - right.stop_sequence);
  }

  return {
    routesById,
    tripsById,
    stopsById,
    stopTimesByTrip,
    source_label: scheduleSourceLabel(input.source || input),
  };
}

function sectionFromStopTimes(index, trip, startTime, endTime) {
  const route = index.routesById.get(trip.route_id);
  const startStop = index.stopsById.get(startTime.stop_id);
  const endStop = index.stopsById.get(endTime.stop_id);
  const pickupTime = startTime.departure_time || startTime.arrival_time;
  const dropoffTime = endTime.arrival_time || endTime.departure_time;

  if (!route || !startStop || !endStop || !pickupTime || !dropoffTime || startStop.stop_id === endStop.stop_id) {
    return null;
  }

  const direction = directionLabel(trip);
  return {
    id: sectionIdFor({
      route_id: route.route_id,
      direction_id: trip.direction_id,
      direction,
      start_stop_id: startStop.stop_id,
      end_stop_id: endStop.stop_id,
    }),
    route_id: route.route_id,
    route_short_name: route.route_short_name,
    route_long_name: route.route_long_name,
    route_label: routeLabel(route),
    corridor_name: route.route_long_name,
    direction_id: trip.direction_id || null,
    direction,
    trip_id: trip.trip_id,
    shape_id: trip.shape_id || null,
    start_stop: startStop,
    end_stop: endStop,
    start_stop_id: startStop.stop_id,
    end_stop_id: endStop.stop_id,
    start_stop_sequence: startTime.stop_sequence,
    end_stop_sequence: endTime.stop_sequence,
    scheduled_pickup_time: pickupTime,
    scheduled_dropoff_time: dropoffTime,
    label: `${startStop.name} -> ${endStop.name}`,
    source_label: index.source_label,
  };
}

function compareRouteSections(left, right) {
  const routeCompare = left.route_short_name.localeCompare(right.route_short_name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (routeCompare !== 0) return routeCompare;
  const directionCompare = left.direction.localeCompare(right.direction, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (directionCompare !== 0) return directionCompare;
  if (left.scheduled_pickup_time !== right.scheduled_pickup_time) {
    return left.scheduled_pickup_time.localeCompare(right.scheduled_pickup_time);
  }
  return left.id.localeCompare(right.id);
}

function buildTransitRouteSections(input = {}) {
  const index = buildScheduleIndex(input);
  const sectionsById = new Map();

  for (const [tripId, stopTimes] of index.stopTimesByTrip) {
    const trip = index.tripsById.get(tripId);
    if (!trip || stopTimes.length < 2) continue;

    for (let stopIndex = 0; stopIndex < stopTimes.length - 1; stopIndex += 1) {
      const section = sectionFromStopTimes(index, trip, stopTimes[stopIndex], stopTimes[stopIndex + 1]);
      if (!section) continue;

      const existing = sectionsById.get(section.id);
      if (!existing) {
        sectionsById.set(section.id, {
          ...section,
          trip_ids: [section.trip_id],
        });
        continue;
      }

      const tripIds = [...new Set([...existing.trip_ids, section.trip_id])];
      if (compareRouteSections(section, existing) < 0) {
        sectionsById.set(section.id, { ...section, trip_ids: tripIds });
      } else {
        existing.trip_ids = tripIds;
      }
    }
  }

  return [...sectionsById.values()].sort(compareRouteSections);
}

function normalizeIdSet(values) {
  return new Set(
    asArray(values)
      .map(asText)
      .filter(Boolean),
  );
}

function findScheduledTransitLeg(input = {}) {
  const index = buildScheduleIndex(input);
  const originStopIds = normalizeIdSet(input.origin_stop_ids || input.originStopIds);
  const destinationStopIds = normalizeIdSet(input.destination_stop_ids || input.destinationStopIds);
  const routeIds = normalizeIdSet(input.route_ids || input.routeIds);
  const sectionIds = normalizeIdSet(input.section_ids || input.sectionIds);
  const requiredStopId = asText(input.stop_id || input.stopId);
  const candidates = [];

  if (!originStopIds.size || !destinationStopIds.size) return null;

  for (const [tripId, stopTimes] of index.stopTimesByTrip) {
    const trip = index.tripsById.get(tripId);
    if (!trip || (routeIds.size && !routeIds.has(trip.route_id))) continue;

    for (let boardIndex = 0; boardIndex < stopTimes.length - 1; boardIndex += 1) {
      const boardTime = stopTimes[boardIndex];
      if (!originStopIds.has(boardTime.stop_id)) continue;

      for (let exitIndex = boardIndex + 1; exitIndex < stopTimes.length; exitIndex += 1) {
        const exitTime = stopTimes[exitIndex];
        if (!destinationStopIds.has(exitTime.stop_id)) continue;

        const leg = sectionFromStopTimes(index, trip, boardTime, exitTime);
        if (!leg) continue;
        if (sectionIds.size && !sectionIds.has(leg.id)) continue;
        if (requiredStopId && leg.start_stop_id !== requiredStopId && leg.end_stop_id !== requiredStopId) {
          continue;
        }
        candidates.push(leg);
      }
    }
  }

  if (!candidates.length) return null;
  return candidates.sort(compareRouteSections)[0];
}

function formatRouteLegDisplay(leg = {}) {
  const boardStop = displayStop(leg.board_stop || leg.start_stop || {});
  const exitStop = displayStop(leg.exit_stop || leg.end_stop || {});
  const walkTime = finiteNumber(leg.walk_time_minutes ?? leg.walk_minutes);
  const workTime = finiteNumber(leg.job_work_time_minutes ?? leg.work_time_minutes);

  return {
    route_number: asText(leg.route_short_name || leg.route_number),
    direction: asText(leg.direction),
    boarding_stop_name: boardStop.name,
    boarding_stop_location: boardStop.location,
    scheduled_pickup_time: asText(leg.scheduled_pickup_time || leg.pickup_time),
    exit_stop_name: exitStop.name,
    exit_stop_location: exitStop.location,
    walk_time_minutes: walkTime,
    job_work_time_minutes: workTime,
    buffer_risk_label: asText(leg.buffer_risk_label || leg.risk_label),
    source_label: scheduleSourceLabel({ source_label: leg.source_label }),
  };
}

module.exports = {
  buildScheduleIndex,
  buildTransitRouteSections,
  findScheduledTransitLeg,
  formatRouteLegDisplay,
  routeLabel,
  sectionIdFor,
};
