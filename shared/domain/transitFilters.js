"use strict";

const ALL_ACCESSIBLE_ROUTES = "all-accessible-routes";
const ALL_SELECTED_ROUTE_SECTIONS = "all-selected-route-sections";
const ALL_STOPS_SELECTED = "all-stops-selected";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function uniqueIds(values) {
  return [...new Set(asArray(values).map(asText).filter(Boolean))];
}

function readIdList(object, keys) {
  const values = [];
  for (const key of keys) {
    const value = object?.[key];
    if (Array.isArray(value)) values.push(...value);
    else if (typeof value === "string") values.push(...value.split(","));
  }
  return uniqueIds(values);
}

function transitAccessForJob(job = {}) {
  const access = job.transit_access || job.transitAccess || {};
  return {
    route_ids: uniqueIds([
      ...readIdList(access, ["route_ids", "routeIds"]),
      ...readIdList(job, ["accessible_route_ids", "accessibleRouteIds"]),
    ]),
    section_ids: uniqueIds([
      ...readIdList(access, ["section_ids", "sectionIds"]),
      ...readIdList(job, ["accessible_section_ids", "accessibleSectionIds"]),
    ]),
    stop_ids: uniqueIds([
      ...readIdList(access, ["stop_ids", "stopIds"]),
      ...readIdList(job, ["accessible_stop_ids", "accessibleStopIds"]),
    ]),
    walk_time_minutes: Number.isFinite(Number(access.walk_time_minutes ?? access.walkMinutes))
      ? Number(access.walk_time_minutes ?? access.walkMinutes)
      : null,
    job_work_time_minutes: Number.isFinite(Number(access.job_work_time_minutes ?? access.jobWorkTimeMinutes))
      ? Number(access.job_work_time_minutes ?? access.jobWorkTimeMinutes)
      : null,
    buffer_risk_label: asText(access.buffer_risk_label || access.bufferRiskLabel),
  };
}

function planIdsForJob(job = {}) {
  return uniqueIds([
    ...readIdList(job, ["plan_ids", "planIds"]),
    job.plan_id,
    job.planId,
  ]);
}

function normalizePlanOptions(jobs, plans) {
  const rawPlans = asArray(plans);
  const options = [];

  for (const rawPlan of rawPlans) {
    const id = asText(rawPlan?.id || rawPlan?.plan_id || rawPlan?.planId);
    if (!id) continue;
    const jobIds = uniqueIds(rawPlan?.job_ids || rawPlan?.jobIds);
    options.push({
      id,
      label: asText(rawPlan?.label || rawPlan?.name || rawPlan?.title || id),
      job_ids: jobIds,
    });
  }

  for (const job of jobs) {
    for (const planId of planIdsForJob(job)) {
      if (options.some((option) => option.id === planId)) continue;
      options.push({ id: planId, label: planId, job_ids: [] });
    }
  }

  if (!options.length) {
    return [{ id: "all-available-jobs", label: "All available jobs", job_ids: jobs.map((job) => asText(job.id)).filter(Boolean) }];
  }

  return options;
}

function jobsForPlan(jobs, plan) {
  if (!plan) return [];
  const explicitJobIds = new Set(plan.job_ids || []);
  const useAllJobs = plan.id === "all-available-jobs";
  return jobs.filter((job) => {
    const jobId = asText(job?.id);
    return useAllJobs || explicitJobIds.has(jobId) || planIdsForJob(job).includes(plan.id);
  });
}

function jobReferencesSection(job, section) {
  const access = transitAccessForJob(job);
  return (
    access.route_ids.includes(section.route_id) ||
    access.section_ids.includes(section.id) ||
    access.stop_ids.includes(section.start_stop_id) ||
    access.stop_ids.includes(section.end_stop_id)
  );
}

function groupCorridors(sections) {
  const byRoute = new Map();
  for (const section of sections) {
    const current = byRoute.get(section.route_id) || {
      id: section.route_id,
      route_id: section.route_id,
      route_short_name: section.route_short_name,
      route_long_name: section.route_long_name,
      label: section.route_label,
      section_ids: [],
      stop_ids: [],
    };
    current.section_ids.push(section.id);
    current.stop_ids.push(section.start_stop_id, section.end_stop_id);
    byRoute.set(section.route_id, current);
  }

  return [...byRoute.values()]
    .map((corridor) => ({
      ...corridor,
      section_ids: uniqueIds(corridor.section_ids),
      stop_ids: uniqueIds(corridor.stop_ids),
    }))
    .sort((left, right) =>
      left.route_short_name.localeCompare(right.route_short_name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

function stopsForSections(sections) {
  const byStop = new Map();
  for (const section of sections) {
    for (const stop of [section.start_stop, section.end_stop]) {
      if (!stop?.stop_id || !stop?.name) continue;
      const current = byStop.get(stop.stop_id) || {
        stop_id: stop.stop_id,
        stop_name: stop.name,
        location: stop.location || "",
        route_ids: [],
        section_ids: [],
      };
      current.route_ids.push(section.route_id);
      current.section_ids.push(section.id);
      byStop.set(stop.stop_id, current);
    }
  }
  return [...byStop.values()]
    .map((stop) => ({
      ...stop,
      route_ids: uniqueIds(stop.route_ids),
      section_ids: uniqueIds(stop.section_ids),
      label: stop.location ? `${stop.stop_name} - ${stop.location}` : stop.stop_name,
    }))
    .sort((left, right) => left.stop_name.localeCompare(right.stop_name, undefined, { sensitivity: "base" }));
}

function selectionValue(selection, snakeCase, camelCase, fallback = "") {
  return asText(selection?.[snakeCase] ?? selection?.[camelCase] ?? fallback);
}

function buildTransitFilterState({ jobs = [], plans = [], sections = [], selection = {} } = {}) {
  const verifiedSections = asArray(sections).filter(
    (section) =>
      asText(section?.id) &&
      asText(section?.route_id) &&
      asText(section?.route_short_name) &&
      asText(section?.trip_id) &&
      asText(section?.start_stop_id) &&
      asText(section?.end_stop_id),
  );
  const planOptions = normalizePlanOptions(jobs, plans);
  const planId = selectionValue(selection, "plan_id", "planId", planOptions[0]?.id);
  const plan = planOptions.find((option) => option.id === planId) || planOptions[0];
  const planJobs = jobsForPlan(jobs, plan);
  const accessibleSections = verifiedSections.filter((section) =>
    planJobs.some((job) => jobReferencesSection(job, section)),
  );
  const allCorridors = groupCorridors(accessibleSections);
  const requestedCorridorIds = uniqueIds(
    selection?.corridor_ids || selection?.corridorIds || [ALL_ACCESSIBLE_ROUTES],
  );
  const corridorIds = requestedCorridorIds.includes(ALL_ACCESSIBLE_ROUTES) || !requestedCorridorIds.length
    ? allCorridors.map((corridor) => corridor.route_id)
    : requestedCorridorIds.filter((id) => allCorridors.some((corridor) => corridor.route_id === id));
  const corridorSections = accessibleSections.filter((section) => corridorIds.includes(section.route_id));
  const sectionId = selectionValue(
    selection,
    "section_id",
    "sectionId",
    ALL_SELECTED_ROUTE_SECTIONS,
  );
  const selectedSections = sectionId === ALL_SELECTED_ROUTE_SECTIONS || !sectionId
    ? corridorSections
    : corridorSections.filter((section) => section.id === sectionId);
  const stopId = selectionValue(selection, "stop_id", "stopId");
  const allStops = stopsForSections(selectedSections);
  const visibleStops = stopId && stopId !== ALL_STOPS_SELECTED
    ? allStops.filter((stop) => stop.stop_id === stopId)
    : allStops;

  const visibleJobs = planJobs.filter((job) => {
    const access = transitAccessForJob(job);
    if (!access.route_ids.length && !access.section_ids.length && !access.stop_ids.length) return false;
    const accessibleForSelectedSection = selectedSections.some((section) => jobReferencesSection(job, section));
    if (!accessibleForSelectedSection) return false;
    if (sectionId && sectionId !== ALL_SELECTED_ROUTE_SECTIONS && !access.section_ids.includes(sectionId)) {
      return false;
    }
    if (stopId && stopId !== ALL_STOPS_SELECTED && !access.stop_ids.includes(stopId)) {
      return false;
    }
    return true;
  });

  return {
    selection: {
      plan_id: plan?.id || "",
      corridor_ids: corridorIds,
      section_id: sectionId || ALL_SELECTED_ROUTE_SECTIONS,
      stop_id: stopId || ALL_STOPS_SELECTED,
    },
    plan_options: planOptions,
    corridors: allCorridors,
    sections: selectedSections,
    stops: visibleStops,
    jobs: visibleJobs,
  };
}

module.exports = {
  ALL_ACCESSIBLE_ROUTES,
  ALL_SELECTED_ROUTE_SECTIONS,
  ALL_STOPS_SELECTED,
  buildTransitFilterState,
  transitAccessForJob,
};
