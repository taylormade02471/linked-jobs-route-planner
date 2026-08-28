(function registerAndroidAppBackbone(root, factory) {
  const api = factory(root.WorkAppBackbone);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.AndroidAppBackbone = api;
})(typeof window !== "undefined" ? window : globalThis, function androidAppBackboneFactory(defaultWorkApi) {
  const PROVIDER_IDS = new Set(["survey_merchandiser", "clickworker", "field_nation", "field_agent"]);
  const ALLOWED_SHARE_MIME_TYPES = new Set(["text/plain", "image/png", "image/jpeg", "application/pdf"]);
  const ANDROID_VAULT = "android_encrypted_storage";

  function asText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function providerId(value) {
    const id = asText(value).toLowerCase();
    return PROVIDER_IDS.has(id) ? id : "survey_merchandiser";
  }

  function mimeType(value) {
    return asText(value).toLowerCase().split(";")[0];
  }

  function normalizeSharePayload(payload = {}) {
    const mime = mimeType(payload.mime_type || payload.type);
    if (!ALLOWED_SHARE_MIME_TYPES.has(mime)) {
      return {
        accepted: false,
        kind: "unsupported",
        mime_type: mime || "unknown",
        reason: "This shared item type is not supported for Android job intake.",
      };
    }

    if (mime === "text/plain") {
      return {
        accepted: true,
        kind: "text",
        mime_type: mime,
        text: String(payload.text || payload.value || ""),
        source: "android-share",
      };
    }

    return {
      accepted: true,
      kind: mime === "application/pdf" ? "pdf" : "screenshot",
      mime_type: mime,
      uri: String(payload.uri || payload.url || ""),
      source: "android-share",
    };
  }

  function createCredentialSaveRequest(input = {}) {
    const id = providerId(input.provider_id);
    const username = asText(input.username || input.email || input.account);
    const password = String(input.password || "");

    return {
      native_payload: {
        provider_id: id,
        username,
        password,
      },
      public_state: {
        provider_id: id,
        username,
        has_saved_login: Boolean(username && password),
        vault: ANDROID_VAULT,
        updated_at: Date.now(),
      },
    };
  }

  function publicCredentialState(state = {}) {
    return {
      provider_id: providerId(state.provider_id),
      username: asText(state.username),
      has_saved_login: Boolean(state.has_saved_login),
      vault: state.vault === ANDROID_VAULT ? ANDROID_VAULT : "",
      updated_at: Number(state.updated_at) || 0,
    };
  }

  function requireWorkApi(workApi) {
    const api = workApi || defaultWorkApi;
    if (!api || typeof api.parseSharedJobs !== "function" || typeof api.isRouteVisibleJob !== "function") {
      throw new Error("WorkAppBackbone is required for Android import review.");
    }
    return api;
  }

  function createImportReviewItems(text, selectedProviderId = "survey_merchandiser", workApi) {
    const api = requireWorkApi(workApi);
    return api.parseSharedJobs(text, providerId(selectedProviderId)).map((job, index) => {
      const status = api.normalizeStatus(job.status);
      const routeJob = { ...job, status };
      const approvable = api.isRouteVisibleJob(routeJob);
      return {
        review_id: [job.id || "job", index].join(":").slice(0, 220),
        review_status: "pending_review",
        approvable,
        blocked_reason: approvable ? "" : "Only open, assigned, or needs-completion jobs can be approved into the route planner.",
        ...job,
        status,
        source: "android-import-review-pending",
      };
    });
  }

  function approveRouteVisibleReviewItems(reviewItems = []) {
    return (Array.isArray(reviewItems) ? reviewItems : [])
      .filter((item) => item && item.approvable === true)
      .map((item) => ({
        ...item,
        review_status: "approved",
        source: "android-import-review",
        imported_at: Date.now(),
      }));
  }

  function approveAvailableReviewItems(reviewItems = []) {
    return approveRouteVisibleReviewItems(reviewItems);
  }

  function createSafeJobSyncPayload(jobs = [], workApi) {
    const api = requireWorkApi(workApi);
    const allowedFields = [
      "id",
      "provider_id",
      "provider_label",
      "connector_id",
      "external_id",
      "title",
      "location_name",
      "address",
      "city",
      "state",
      "postcode",
      "lat",
      "lon",
      "lng",
      "distance_miles",
      "pay_cents",
      "due",
      "accepted_at",
      "minutes",
      "duration_text",
      "timer_minutes",
      "photos_required",
      "purchase_required",
      "requirements",
      "ready_state",
      "status",
      "payment_status",
      "source",
      "source_video",
      "submitted_at",
      "review_note",
      "order",
      "imported_at",
      "updated_at",
    ];

    const isSyncableSafeJob = (job) =>
      api.isRouteVisibleJob(job) ||
      (typeof api.isCompletedJob === "function"
        ? api.isCompletedJob(job)
        : api.normalizeStatus(job?.status) === "completed");

    const safeJobs = (Array.isArray(jobs) ? jobs : [])
      .map((job) => ({ ...job, status: api.normalizeStatus(job?.status) }))
      .filter(isSyncableSafeJob)
      .map((job) => {
        const safe = {};
        allowedFields.forEach((field) => {
          if (job[field] !== undefined && job[field] !== null && job[field] !== "") safe[field] = job[field];
        });
        return safe;
      });

    return {
      source: "android-safe-provider-sync",
      synced_at: Date.now(),
      jobs: safeJobs,
    };
  }

  function createProviderCheckPlan(input = {}) {
    return {
      provider_id: providerId(input.provider_id),
      can_use_saved_login: Boolean(input.has_saved_login),
      can_scan_private_app_storage: false,
      allowed_methods: [
        "open_provider_app",
        "share_visible_text",
        "capture_screenshot",
        "browser_board_adapter_if_available",
      ],
    };
  }

  return {
    ALLOWED_SHARE_MIME_TYPES: Array.from(ALLOWED_SHARE_MIME_TYPES),
    ANDROID_VAULT,
    approveAvailableReviewItems,
    approveRouteVisibleReviewItems,
    createCredentialSaveRequest,
    createImportReviewItems,
    createProviderCheckPlan,
    createSafeJobSyncPayload,
    normalizeSharePayload,
    publicCredentialState,
  };
});
