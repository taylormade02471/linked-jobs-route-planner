(function registerTransitPicker(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.TransitPicker = api;
})(typeof window !== "undefined" ? window : globalThis, function transitPickerFactory() {
  const NON_TRANSIT_ROUTES = new Set(["walk", "link"]);
  const DIRECTION_NAMES = {
    NB: "Northbound",
    SB: "Southbound",
    EB: "Eastbound",
    WB: "Westbound",
  };

  function sectionIsVerified(data, sectionId) {
    const legs = data?.sections?.[sectionId]?.legs;
    if (!Array.isArray(legs) || !legs.length) return false;

    // A selector is available only when the saved static itinerary has both stop records.
    return legs.some(
      (leg) =>
        !NON_TRANSIT_ROUTES.has(String(leg.route || "").toLowerCase()) &&
        leg.board &&
        leg.alight &&
        leg.board_stop?.name &&
        leg.alight_stop?.name &&
        Array.isArray(leg.segment) &&
        leg.segment.length
    );
  }

  function planSectionKeys(data, planName) {
    const sectionIds = data?.plans?.[planName];
    if (!Array.isArray(sectionIds)) return [];
    return Array.from(sectionIds).filter((sectionId) => sectionIsVerified(data, sectionId));
  }

  function routeNumbersForSection(data, sectionId) {
    const seen = new Set();
    const legs = data?.sections?.[sectionId]?.legs || [];

    return legs.reduce((routes, leg) => {
      const route = String(leg.route || "").trim();
      if (!route || NON_TRANSIT_ROUTES.has(route.toLowerCase()) || seen.has(route)) {
        return routes;
      }
      seen.add(route);
      routes.push(route);
      return routes;
    }, []);
  }

  function directionForLeg(leg) {
    const text = [leg?.board_stop?.name, leg?.alight_stop?.name, leg?.label]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    for (const [shortName, longName] of Object.entries(DIRECTION_NAMES)) {
      if (new RegExp("\\b" + shortName + "\\b").test(text)) {
        return longName;
      }
    }

    return "";
  }

  function directionForSection(data, sectionId) {
    const legs = data?.sections?.[sectionId]?.legs || [];
    return legs.map(directionForLeg).find(Boolean) || "";
  }

  function corridorOptions(data, planName) {
    return planSectionKeys(data, planName).map((sectionId) => {
      const section = data.sections[sectionId];
      const routes = routeNumbersForSection(data, sectionId);
      const routeLabel =
        routes.length === 1 ? "Route " + routes[0] : "Routes " + routes.join(" & ");

      return {
        id: sectionId,
        routeNumbers: routes,
        label: routeLabel + " - " + section.title,
      };
    });
  }

  function selectedSectionKeys(data, planName, corridorIds) {
    const available = planSectionKeys(data, planName);
    if (!Array.isArray(corridorIds) || corridorIds.includes("all-accessible-routes")) {
      return available;
    }

    const selected = new Set(corridorIds);
    return available.filter((sectionId) => selected.has(sectionId));
  }

  function sectionLabel(data, sectionId) {
    const section = data?.sections?.[sectionId];
    const legs = section?.legs || [];
    const first = legs[0];
    const last = legs[legs.length - 1];
    if (!first?.board_stop?.name || !last?.alight_stop?.name) return "";

    const direction = directionForSection(data, sectionId);
    return [
      first.board_stop.name + " -> " + last.alight_stop.name,
      section.title,
      direction,
    ]
      .filter(Boolean)
      .join(" - ");
  }

  function stopOptions(data, sectionIds) {
    const stops = new Map();

    sectionIds.forEach((sectionId) => {
      const legs = data?.sections?.[sectionId]?.legs || [];
      legs.forEach((leg) => {
        [
          { id: leg.board, stop: leg.board_stop },
          { id: leg.alight, stop: leg.alight_stop },
        ].forEach(({ id, stop }) => {
          if (!id || !stop?.name || stops.has(id)) return;
          stops.set(id, {
            id,
            name: stop.name,
            location: stop.name,
          });
        });
      });
    });

    return [...stops.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function legsForSelection(data, planName, corridorIds, viewValue) {
    const sectionIds = selectedSectionKeys(data, planName, corridorIds);
    const makeLeg = (leg, sectionId) => ({ ...leg, _section: sectionId });

    if (!viewValue || viewValue === "all-selected-route-sections") {
      return sectionIds.flatMap((sectionId) =>
        (data.sections[sectionId]?.legs || []).map((leg) => makeLeg(leg, sectionId))
      );
    }

    if (viewValue.startsWith("section:")) {
      const sectionId = viewValue.slice("section:".length);
      if (!sectionIds.includes(sectionId)) return [];
      return (data.sections[sectionId]?.legs || []).map((leg) => makeLeg(leg, sectionId));
    }

    if (viewValue.startsWith("stop:")) {
      const stopId = viewValue.slice("stop:".length);
      return sectionIds.flatMap((sectionId) =>
        (data.sections[sectionId]?.legs || [])
          .filter((leg) => leg.board === stopId || leg.alight === stopId)
          .map((leg) => makeLeg(leg, sectionId))
      );
    }

    return [];
  }

  function scheduledWindow(staticText) {
    const times = String(staticText || "").match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi) || [];

    return {
      pickup: times[0] || "Not provided by the verified schedule",
      exit: times[1] || "Not provided by the verified schedule",
    };
  }

  function walkTime(staticText) {
    const match = String(staticText || "").match(/(?:allow\s*)?~?(\d+)\s*(?:min|minute)s?\s+walk/i);
    return match ? match[1] + " min" : "Not provided by the verified schedule";
  }

  function jobWorkTime(data, leg) {
    const minutes = data?.jobs?.[leg?.job]?.minutes;
    return Number.isFinite(minutes) ? minutes + " min" : "No job work time attached";
  }

  return {
    corridorOptions,
    directionForLeg,
    directionForSection,
    jobWorkTime,
    legsForSelection,
    planSectionKeys,
    routeNumbersForSection,
    scheduledWindow,
    sectionIsVerified,
    sectionLabel,
    selectedSectionKeys,
    stopOptions,
    walkTime,
  };
});

