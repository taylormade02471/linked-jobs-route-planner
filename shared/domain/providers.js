const PROVIDERS = [
  {
    provider_id: "survey_merchandiser",
    display_name: "Survey Merchandiser",
    status: "needs_phone_connection",
    allowed_domains: ["survey.com", "www.survey.com", "support.survey.com"],
    recognized_job_urls: [],
    login_url: "",
    board_url: "https://survey.com/",
    source_label: "phone app connection pending",
  },
  {
    provider_id: "clickworker",
    display_name: "Clickworker",
    status: "needs_phone_connection",
    allowed_domains: ["clickworker.com", "www.clickworker.com", "workplace.clickworker.com"],
    recognized_job_urls: [],
    login_url: "https://workplace.clickworker.com/",
    board_url: "https://workplace.clickworker.com/",
    source_label: "phone app or workplace connection pending",
  },
  {
    provider_id: "field_nation",
    display_name: "Field Nation",
    status: "needs_phone_connection",
    allowed_domains: ["fieldnation.com", "www.fieldnation.com"],
    recognized_job_urls: [],
    login_url: "https://fieldnation.com/",
    board_url: "https://fieldnation.com/",
    source_label: "phone app connection pending",
  },
];

function asText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function providerById(providerId) {
  const id = asText(providerId).toLowerCase();
  return PROVIDERS.find((provider) => provider.provider_id === id) || null;
}

function identifyProviderByUrl(url) {
  const host = normalizedHost(url);
  if (!host) return null;
  return (
    PROVIDERS.find((provider) =>
      provider.allowed_domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
    ) || null
  );
}

function identifyProviderForJob(job = {}) {
  return (
    providerById(job.provider_id) ||
    identifyProviderByUrl(job.source_url) ||
    identifyProviderByUrl(job.info_url) ||
    identifyProviderByUrl(job.details_url) ||
    null
  );
}

function normalizeWorkflowStatus(job = {}) {
  const status = asText(job.workflow_status || job.status || job.detail_fields?.status).toLowerCase();
  if (status.includes("awaiting")) return "awaiting_payment";
  if (status.includes("submitted")) return "awaiting_payment";
  if (status.includes("paid")) return "completed";
  if (status.includes("complete") || status.includes("done")) return "completed";
  if (status.includes("planned")) return "planned";
  if (status.includes("available")) return "available";
  if (job.is_completed) return "completed";
  return "active";
}

function isOpenAvailableJob(job = {}) {
  const status = normalizeWorkflowStatus(job);
  return status === "active" || status === "available";
}

function hasCoordinates(job = {}) {
  const lat = Number(job.lat);
  const lng = Number(job.lng ?? job.lon);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function buildJobBoardSummaries({ jobs = [], sourceStatus = {} } = {}) {
  const summaries = PROVIDERS.map((provider) => {
    const providerJobs = jobs.filter((job) => identifyProviderForJob(job)?.provider_id === provider.provider_id);
    const openJobs = providerJobs.filter(isOpenAvailableJob);
    const statusProvider = identifyProviderByUrl(sourceStatus.pageUrl);
    const statusForProvider = statusProvider?.provider_id === provider.provider_id ? sourceStatus : {};

    return {
      provider_id: provider.provider_id,
      display_name: provider.display_name,
      status: provider.status,
      board_url: provider.board_url,
      login_url: provider.login_url,
      source_label: provider.source_label,
      connection_state:
        asText(statusForProvider.state) ||
        (provider.status === "linked" ? "ready" : "needs phone connection"),
      last_synced_at: asText(statusForProvider.lastScrapeAt),
      last_message: asText(statusForProvider.message),
      open_available_count: openJobs.length,
      mapped_available_count: openJobs.filter(hasCoordinates).length,
      total_seen_count: providerJobs.length,
    };
  });

  const unknownJobs = jobs.filter((job) => !identifyProviderForJob(job));
  if (unknownJobs.length) {
    const openUnknown = unknownJobs.filter(isOpenAvailableJob);
    summaries.push({
      provider_id: "unknown",
      display_name: "Other linked job boards",
      status: "needs_adapter",
      board_url: "",
      login_url: "",
      source_label: "adapter pending",
      connection_state: "needs adapter",
      last_synced_at: "",
      last_message: "Jobs were received but do not match a verified provider yet.",
      open_available_count: openUnknown.length,
      mapped_available_count: openUnknown.filter(hasCoordinates).length,
      total_seen_count: unknownJobs.length,
    });
  }

  return summaries;
}

module.exports = {
  PROVIDERS,
  buildJobBoardSummaries,
  identifyProviderByUrl,
  identifyProviderForJob,
  isOpenAvailableJob,
  normalizeWorkflowStatus,
};
