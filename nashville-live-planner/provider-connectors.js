(function registerProviderConnectors(root, factory) {
  const api = factory(root.WorkAppBackbone);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ProviderConnectors = api;
})(typeof window !== "undefined" ? window : globalThis, function providerConnectorsFactory(defaultWorkApi) {
  const work =
    defaultWorkApi ||
    (typeof require === "function" ? require("./work-app-backbone.js") : null);

  if (!work) {
    throw new Error("WorkAppBackbone is required for provider connectors.");
  }

  const PROVIDER_CONNECTORS = [
    {
      id: "survey_merchandiser",
      label: "Survey Merchandiser",
      intake_type: "share_text_or_screenshot",
      supports_available_jobs: true,
      supports_assigned_jobs: true,
      app_connection_only: true,
    },
    {
      id: "clickworker",
      label: "Clickworker",
      intake_type: "share_text_or_screenshot",
      supports_available_jobs: true,
      supports_assigned_jobs: true,
      app_connection_only: true,
    },
    {
      id: "field_nation",
      label: "Field Nation",
      intake_type: "share_text_or_screenshot",
      supports_available_jobs: true,
      supports_assigned_jobs: true,
      app_connection_only: true,
    },
    {
      id: "field_agent",
      label: "Field Agent",
      intake_type: "share_text_or_screenshot",
      supports_available_jobs: true,
      supports_assigned_jobs: true,
      app_connection_only: true,
    },
    {
      id: "generic_ocr",
      label: "Generic screenshot/OCR importer",
      intake_type: "screenshot_or_pdf",
      supports_available_jobs: true,
      supports_assigned_jobs: true,
      app_connection_only: false,
    },
  ];

  function asText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function connectorById(providerId) {
    const id = asText(providerId).toLowerCase();
    return PROVIDER_CONNECTORS.find((connector) => connector.id === id) || PROVIDER_CONNECTORS[0];
  }

  function externalIdFor(providerId, text) {
    const body = String(text || "");
    const patterns = {
      survey_merchandiser: /\b(?:job|task|assignment)\s*(?:id|#|number)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
      clickworker: /\b(?:job|task|project|workplace)\s*(?:id|#|number)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
      field_nation: /\b(?:work\s*order|wo)\s*(?:id|#|number)?\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      field_agent: /\b(?:job|mission|task)\s*(?:id|#|number)?\s*[:#]?\s*([A-Z0-9-]{4,})/i,
    };
    const match = body.match(patterns[providerId] || /\b(?:job|task)\s*(?:id|#)?\s*[:#]?\s*([A-Z0-9-]{4,})/i);
    return match ? asText(match[1]) : "";
  }

  function parseProviderText(providerId, text) {
    const connector = connectorById(providerId);
    if (connector.id === "generic_ocr") {
      return work.parseSharedJobs(text, "survey_merchandiser");
    }

    return work.parseSharedJobs(text, connector.id).map((job) => {
      const externalId = externalIdFor(connector.id, text);
      return {
        ...job,
        external_id: externalId || job.external_id || "",
        connector_id: connector.id,
        source: "provider-connector-text",
      };
    });
  }

  function routeVisibleJobs(jobs) {
    return (Array.isArray(jobs) ? jobs : []).filter(work.isRouteVisibleJob);
  }

  function createGenericOcrIntake(payload = {}) {
    const mime = asText(payload.mime_type || payload.type).toLowerCase().split(";")[0];
    const isPdf = mime === "application/pdf";
    const isImage = mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg";
    return {
      connector_id: "generic_ocr",
      provider_id: asText(payload.provider_id) || "generic_ocr",
      status: "needs_ocr",
      kind: isPdf ? "pdf" : isImage ? "screenshot" : "unsupported",
      mime_type: mime || "unknown",
      uri: String(payload.uri || payload.url || ""),
      received_at: Date.now(),
      source: "generic-ocr-intake",
      accepted: isPdf || isImage,
    };
  }

  return {
    PROVIDER_CONNECTORS,
    connectorById,
    createGenericOcrIntake,
    parseProviderText,
    routeVisibleJobs,
  };
});
