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
    collectVerifiedRoutes,
    collectPlanJobIds,
    buildGuidance,
  };
});
