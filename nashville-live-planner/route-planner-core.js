(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RoutePlannerCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_STOPS = 20;

  function normalizeStopIds(ids) {
    const unique = [];
    new Set((Array.isArray(ids) ? ids : []).map(String)).forEach((id) => {
      if (id && unique.length < MAX_STOPS) unique.push(id);
    });
    return unique;
  }

  function distanceMiles(a, b) {
    if (!a || !b || !Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng ?? a.lon)) || !Number.isFinite(Number(b.lat)) || !Number.isFinite(Number(b.lng ?? b.lon))) {
      return null;
    }
    const lat1 = Number(a.lat) * Math.PI / 180;
    const lat2 = Number(b.lat) * Math.PI / 180;
    const dLat = lat2 - lat1;
    const dLon = (Number(b.lng ?? b.lon) - Number(a.lng ?? a.lon)) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function orderStopsByFeasibility(stops, origin) {
    const remaining = Array.isArray(stops) ? stops.slice(0, MAX_STOPS) : [];
    const ordered = [];
    let cursor = origin;
    while (remaining.length) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      remaining.forEach((stop, index) => {
        const distance = distanceMiles(cursor, stop);
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next);
      cursor = next;
    }
    return ordered;
  }

  function isMappableStop(stop) {
    return distanceMiles(stop, stop) !== null;
  }

  function planFurthestFirstReturnSweep(jobs, origin, options = {}) {
    const returnPoint = options.returnPoint || origin;
    const startLabel = origin?.label || "Current location";
    const safeJobs = (Array.isArray(jobs) ? jobs : [])
      .filter(isMappableStop)
      .slice(0, MAX_STOPS)
      .map((job) => ({ ...job, id: String(job.id), kind: job.kind || "job" }));
    const lunchStop = isMappableStop(options.lunchStop)
      ? { ...options.lunchStop, id: String(options.lunchStop.id || "lunch"), kind: "lunch" }
      : null;

    if (!isMappableStop(origin) || !isMappableStop(returnPoint)) {
      return {
        mode: "furthest_first_return_sweep",
        source: "map_coordinate_estimate",
        requiresTransitVerification: true,
        stops: [],
        skippedCount: safeJobs.length,
        totalMapMiles: 0,
        returnPoint: { ...returnPoint, label: returnPoint?.label || startLabel },
        warning: "A current map location is required before a return route can be planned.",
      };
    }

    const seenIds = new Set();
    const candidates = [...safeJobs, ...(lunchStop ? [lunchStop] : [])]
      .filter((stop) => {
        if (!stop.id || seenIds.has(stop.id)) return false;
        seenIds.add(stop.id);
        return true;
      })
      .map((stop) => ({ ...stop, distanceFromReturnMiles: distanceMiles(returnPoint, stop) }))
      // The day starts in the outermost feasible area, then works progressively toward the return point.
      .sort((a, b) => b.distanceFromReturnMiles - a.distanceFromReturnMiles || a.id.localeCompare(b.id));

    let cursor = origin;
    let totalMapMiles = 0;
    const stops = candidates.map((stop, index) => {
      const legMapMiles = distanceMiles(cursor, stop) || 0;
      totalMapMiles += legMapMiles;
      cursor = stop;
      return {
        ...stop,
        sequence: index + 1,
        legMapMiles,
      };
    });
    const returnLegMiles = stops.length ? distanceMiles(cursor, returnPoint) || 0 : 0;
    totalMapMiles += returnLegMiles;

    return {
      mode: "furthest_first_return_sweep",
      source: "map_coordinate_estimate",
      requiresTransitVerification: true,
      stops,
      skippedCount: Math.max(0, (Array.isArray(jobs) ? jobs.length : 0) - safeJobs.length),
      totalMapMiles,
      returnLegMiles,
      returnPoint: { ...returnPoint, label: returnPoint?.label || startLabel },
      warning: "This is a map-coordinate sequence, not a live CTS bus itinerary. Verify every transit leg in RideCTS before leaving.",
    };
  }

  function collectVerifiedRoutes(data) {
    const routes = new Map();
    Object.values((data && data.sections) || {}).forEach((section) => {
      (section.legs || []).forEach((leg) => {
        const shortName = String(leg.route || "");
        if (!shortName || shortName === "walk" || shortName === "link" || !leg.board_stop || !leg.alight_stop) return;
        const route = routes.get(shortName) || {
          shortName,
          corridors: [],
          sections: [],
        };
        if (section.title && !route.corridors.includes(section.title)) route.corridors.push(section.title);
        if (section.title && !route.sections.includes(section.title)) route.sections.push(section.title);
        routes.set(shortName, route);
      });
    });
    return Array.from(routes.values()).sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));
  }

  function collectPlanJobIds(data, planName) {
    const ids = [];
    ((data && data.plans && data.plans[planName]) || []).forEach((sectionKey) => {
      ((data.sections || {})[sectionKey]?.legs || []).forEach((leg) => {
        [leg.job, leg.extra_job].filter(Boolean).forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
      });
    });
    return ids;
  }

  function buildGuidance(origin, target) {
    const distance = distanceMiles(origin, target);
    const latDelta = Number(target?.lat) - Number(origin?.lat);
    const lngDelta = Number(target?.lng ?? target?.lon) - Number(origin?.lng ?? origin?.lon);
    const angle = Math.atan2(lngDelta, latDelta) * 180 / Math.PI;
    const bearing = (angle + 360) % 360;
    const directions = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
    const direction = directions[Math.round(bearing / 45) % directions.length];
    const targetName = target?.name || target?.address || "next stop";
    const distanceText = distance === null ? "distance unavailable" : `${distance.toFixed(2)} mi`;
    return {
      targetName,
      distanceMiles: distance,
      direction,
      instruction: `Head ${direction} toward ${targetName} (${distanceText}).`,
    };
  }

  return {
    MAX_STOPS,
    distanceMiles,
    normalizeStopIds,
    orderStopsByFeasibility,
    planFurthestFirstReturnSweep,
    collectVerifiedRoutes,
    collectPlanJobIds,
    buildGuidance,
  };
});
