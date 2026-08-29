(function registerWorkAppBackbone(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.WorkAppBackbone = api;
})(typeof window !== "undefined" ? window : globalThis, function workAppBackboneFactory() {
  const PROVIDERS = [
    {
      id: "survey_merchandiser",
      label: "Survey Merchandiser",
      connection: "External app session",
      boardUrl: "https://survey.com/",
      loginUrl: "https://survey.com/",
      androidPackage: "iSurvey.Android",
      androidIntentUrl: "intent://open/#Intent;package=iSurvey.Android;end",
      emailDomains: ["survey.com"],
      connectionHelp: "Use the Survey Merchandiser app for sign-in, then save only this planner's local connection status.",
    },
    {
      id: "clickworker",
      label: "Clickworker",
      connection: "Workplace or phone app session",
      boardUrl: "https://workplace.clickworker.com/",
      loginUrl: "https://workplace.clickworker.com/",
      androidPackage: "com.clickworker.clickworkerapp",
      androidIntentUrl: "intent://open/#Intent;package=com.clickworker.clickworkerapp;end",
      emailDomains: ["clickworker.com"],
      connectionHelp: "Open the official Workplace login or phone app; the planner stores status, not the Clickworker password.",
    },
    {
      id: "field_nation",
      label: "Field Nation",
      connection: "External app session",
      boardUrl: "https://fieldnation.com/",
      loginUrl: "https://fieldnation.com/",
      androidPackage: "com.fieldnation.android",
      androidIntentUrl: "intent://open/#Intent;package=com.fieldnation.android;end",
      emailDomains: ["fieldnation.com"],
      connectionHelp: "Use Field Nation's platform or app for sign-in; this planner only stores non-secret connection metadata.",
    },
    {
      id: "field_agent",
      label: "Field Agent",
      connection: "External app session",
      boardUrl: "https://app.fieldagent.net/get-the-app",
      loginUrl: "https://app.fieldagent.net/",
      androidPackage: "net.fieldagent",
      androidIntentUrl: "intent://open/#Intent;package=net.fieldagent;end",
      emailDomains: ["fieldagent.net"],
      connectionHelp: "Use Field Agent's app for map/open jobs; share or capture visible job details into this planner.",
    },
  ];

  const SAFE_CONNECTION_STATUSES = new Set(["not_connected", "signed_in_external", "needs_login"]);
  const SECRET_FIELD_PATTERN = /(password|passcode|token|secret|cookie|session|authorization|bearer|api[_-]?key|csrf)/i;
  const KEY_VAULT_RAW_SECRET_FIELD_PATTERN = /(password|passcode|token|cookie|session|authorization|bearer|api[_-]?key|csrf|client_secret|secret_value|private[_-]?key|private[_-]?certificate)/i;
  const SYNC_INTERVALS = [0, 5, 10, 15, 30, 60];
  const EMAIL_PERMISSION_OPTIONS = [
    {
      id: "outlook_mail_read",
      label: "Outlook / Hotmail read-only email",
      scope: "https://graph.microsoft.com/Mail.Read",
      permission: "Microsoft Graph delegated Mail.Read",
      status: "needs_oauth_client",
    },
    {
      id: "gmail_readonly",
      label: "Gmail read-only email",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      permission: "Gmail API readonly",
      status: "oauth_client_created_testing",
    },
  ];
  const CONNECTION_SETUP = [
    {
      id: "outlook_mail_read_oauth",
      label: "Outlook / Hotmail OAuth",
      type: "email_oauth",
      provider: "Microsoft Graph",
      permission: "Delegated Mail.Read only",
      redirectUris: [
        "https://nashville-live-audit-transit-planne.vercel.app/",
        "https://routeplanner.space/",
        "https://www.routeplanner.space/",
      ],
      storage: "Native Android MSAL secure token cache or approved browser OAuth cache",
      status: "needs_microsoft_app_registration",
    },
    {
      id: "gmail_readonly_oauth",
      label: "Gmail OAuth",
      type: "email_oauth",
      provider: "Google Gmail API",
      permission: "gmail.readonly only",
      clientId: "554839816124-pgscs326aspoch273k9b39cpnnthmcps.apps.googleusercontent.com",
      allowedOrigins: [
        "https://nashville-live-audit-transit-planne.vercel.app",
        "https://routeplanner.space",
        "https://www.routeplanner.space",
      ],
      redirectUris: [
        "https://nashville-live-audit-transit-planne.vercel.app/",
      ],
      storage: "Native secure token cache after Google verification; no client secret in the public app",
      status: "oauth_client_created_testing_gmail_api_enabled",
    },
    {
      id: "provider_phone_app_bridge",
      label: "Phone app provider bridge",
      type: "provider_app_bridge",
      provider: "Survey Merchandiser, Clickworker, Field Nation, Field Agent",
      permission: "Android app launch plus text/plain share intake",
      redirectUris: [],
      storage: "Local planner app data for parsed jobs, not provider credentials",
      status: "available_for_android_wrapper",
    },
    {
      id: "provider_visible_page_connector",
      label: "Visible web page connector",
      type: "provider_web_connector",
      provider: "Provider websites after manual login",
      permission: "Read visible job rows only after user login",
      redirectUris: [],
      storage: "Local planner app data for parsed jobs, not website passwords or cookies",
      status: "provider_by_provider_review",
    },
  ];
  const API_REGISTRY = [
    {
      id: "azure_key_vault",
      provider: "Microsoft Azure",
      label: "Azure Key Vault metadata",
      audience: "Local app config only",
      permissions: ["certificates", "keys", "secrets", "api keys"],
      app_type: "vault-backed secret storage",
      public_values: {
        vault_name: "linkedjobs-vault",
        tenant_id: "1befa2db-da34-4cd9-a1d6-d543f8f9c0e5",
        tenant_name: "Default Directory",
        primary_domain: "kyletaylor133hotmail.onmicrosoft.com",
        license: "Microsoft Entra ID Free",
        subscription_id: "",
      },
      storage: "Private secrets stay in Azure Key Vault; only names and references are stored in the planner",
      background_sync: "Allowed only for metadata refresh and secret reference lookup",
      status: "ready_for_vault_binding",
    },
    {
      id: "outlook_mail_read_api",
      provider: "Microsoft Graph",
      label: "Outlook / Hotmail Mail.Read API",
      audience: "Personal Microsoft accounts only",
      permissions: ["Mail.Read"],
      app_type: "public client with delegated consent",
      public_values: {
        client_id: null,
        redirect_uris: [
          "https://nashville-live-audit-transit-planne.vercel.app/",
          "https://routeplanner.space/",
          "https://www.routeplanner.space/",
        ],
      },
      storage: "Native secure token cache only; no password, cookie, refresh token, or secret in source or GitHub",
      background_sync: "Allowed only after user OAuth consent and safe local token storage",
      status: "ready_for_app_registration",
    },
    {
      id: "gmail_readonly_api",
      provider: "Google Gmail API",
      label: "Gmail readonly API",
      audience: "Google testing mode until verification",
      permissions: ["gmail.readonly"],
      app_type: "public web client",
      public_values: {
        client_id: "554839816124-pgscs326aspoch273k9b39cpnnthmcps.apps.googleusercontent.com",
        redirect_uris: ["https://nashville-live-audit-transit-planne.vercel.app/"],
      },
      storage: "Memory-only browser token for the current session; no client secret stored in source, GitHub, or browser storage",
      background_sync: "Allowed only while the browser session token is valid",
      status: "testing_mode_ready",
    },
    {
      id: "provider_phone_app_bridge_api",
      provider: "Android app bridge",
      label: "Phone app connector API",
      audience: "Installed device only",
      permissions: ["openProviderApp", "share text/plain", "camera capture"],
      app_type: "native bridge",
      public_values: {
        client_id: null,
        redirect_uris: [],
      },
      storage: "Local planner data only; no provider passwords, API keys, MFA codes, or cookies",
      background_sync: "Allowed only for local app state, not private provider sessions",
      status: "ready_for_device_bridge",
    },
  ];

  const KEY_VAULT_BINDINGS = [
    {
      id: "planner_backend",
      label: "Linked Jobs Planner backend",
      provider: "Microsoft Azure",
      authorization: "Azure managed identity or workload identity for the planner runtime",
      purpose: "Private runtime configuration for an Azure-hosted backend",
      defaultSecretName: "planner-api-secret",
      defaultCertificateName: "planner-api-cert",
      defaultKeyName: "planner-data-key",
      defaultApiReferenceName: "",
      status: "needs_vault_selection",
    },
    {
      id: "survey_merchandiser",
      label: "Survey Merchandiser",
      provider: "Survey Merchandiser",
      authorization: "Official provider API, OAuth, or export only; otherwise use Android share or visible-page intake",
      purpose: "Store a provider-issued API reference only if Survey Merchandiser supplies one",
      defaultSecretName: "survey-merchandiser-api-key",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "survey-merchandiser-api-ref",
      status: "provider_official_access_required",
    },
    {
      id: "clickworker",
      label: "Clickworker",
      provider: "Clickworker",
      authorization: "Official provider API, OAuth, or export only; otherwise use Android share or visible-page intake",
      purpose: "Store a provider-issued API reference only if Clickworker supplies one",
      defaultSecretName: "clickworker-api-key",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "clickworker-api-ref",
      status: "provider_official_access_required",
    },
    {
      id: "field_nation",
      label: "Field Nation",
      provider: "Field Nation",
      authorization: "Official provider API, OAuth, or export only; otherwise use Android share or visible-page intake",
      purpose: "Store a provider-issued API reference only if Field Nation supplies one",
      defaultSecretName: "field-nation-api-key",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "field-nation-api-ref",
      status: "provider_official_access_required",
    },
    {
      id: "field_agent",
      label: "Field Agent",
      provider: "Field Agent",
      authorization: "Official provider API, OAuth, or export only; otherwise use Android share or visible-page intake",
      purpose: "Store a provider-issued API reference only if Field Agent supplies one",
      defaultSecretName: "field-agent-api-key",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "field-agent-api-ref",
      status: "provider_official_access_required",
    },
    {
      id: "outlook_mail_read",
      label: "Outlook / Hotmail Mail.Read",
      provider: "Microsoft Graph",
      authorization: "Delegated Mail.Read only through Microsoft identity OAuth",
      purpose: "Public-client OAuth metadata; native MSAL owns the token cache",
      defaultSecretName: "",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "outlook-mail-read-client-ref",
      status: "needs_microsoft_app_registration",
    },
    {
      id: "gmail_readonly",
      label: "Gmail readonly",
      provider: "Google Gmail API",
      authorization: "gmail.readonly only through Google OAuth",
      purpose: "Public-client OAuth metadata; the browser or native client owns the session token",
      defaultSecretName: "",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "gmail-readonly-client-ref",
      status: "testing_mode_ready",
    },
    {
      id: "provider_phone_app_bridge",
      label: "Android provider app bridge",
      provider: "Android app bridge",
      authorization: "Installed provider app plus user-approved text/plain share",
      purpose: "No provider credential storage; save only parsed planner data locally",
      defaultSecretName: "",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "",
      status: "ready_for_device_bridge",
    },
    {
      id: "provider_visible_page_connector",
      label: "Visible provider page connector",
      provider: "Provider websites",
      authorization: "User signs in manually; read visible job rows only",
      purpose: "No website password or cookie storage; save parsed planner data locally",
      defaultSecretName: "",
      defaultCertificateName: "",
      defaultKeyName: "",
      defaultApiReferenceName: "",
      status: "provider_by_provider_review",
    },
  ];

  const KEY_VAULT_STATUSES = new Set([
    "needs_vault_selection",
    "reference_ready",
    "bound_to_azure_runtime",
    "provider_official_access_required",
    "needs_microsoft_app_registration",
    "testing_mode_ready",
    "ready_for_device_bridge",
    "provider_by_provider_review",
  ]);

  const STREET_PATTERN = /\b\d{2,6}\s+[^,\n]*(?:street|st|avenue|ave|road|rd|pike|hwy|highway|lane|ln|drive|dr|boulevard|blvd|way|court|ct|circle|cir|place|pl)\b[^,\n]*(?:,\s*[^,\n]+){0,3}/i;

  function asText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function providerById(providerId) {
    const id = asText(providerId).toLowerCase();
    return PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[0];
  }

  function safeConnectionStatus(value) {
    const status = asText(value).toLowerCase();
    return SAFE_CONNECTION_STATUSES.has(status) ? status : "not_connected";
  }

  function sanitizeConnectionSettings(settings = {}) {
    const provider = providerById(settings.provider_id);
    const requestedInterval = Number(settings.sync_interval_minutes);
    const syncInterval = SYNC_INTERVALS.includes(requestedInterval) ? requestedInterval : 0;
    const safe = {
      provider_id: provider.id,
      status: safeConnectionStatus(settings.status),
      account_label: asText(settings.account_label).slice(0, 90),
      notes: asText(settings.notes).slice(0, 180),
      stay_signed_in_external: Boolean(settings.stay_signed_in_external),
      background_sync_enabled: Boolean(settings.background_sync_enabled) && syncInterval > 0,
      sync_interval_minutes: syncInterval,
      last_sync_at: Number(settings.last_sync_at) || 0,
      sync_status: asText(settings.sync_status).slice(0, 140),
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    Object.keys(settings || {}).forEach((key) => {
      if (SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
    });

    return safe;
  }

  function defaultEmailAllowlist() {
    return PROVIDERS.flatMap((provider) => provider.emailDomains || []).join("\n");
  }

  function sanitizeEmailSyncSettings(settings = {}) {
    const requestedInterval = Number(settings.sync_interval_minutes);
    const syncInterval = SYNC_INTERVALS.includes(requestedInterval) ? requestedInterval : 0;
    const safe = {
      account_label: asText(settings.account_label).slice(0, 90),
      permission_id: EMAIL_PERMISSION_OPTIONS.some((option) => option.id === settings.permission_id)
        ? settings.permission_id
        : "outlook_mail_read",
      sender_allowlist: asText(settings.sender_allowlist || defaultEmailAllowlist()).slice(0, 600),
      metadata_first: settings.metadata_first !== false,
      background_sync_enabled: Boolean(settings.background_sync_enabled) && syncInterval > 0,
      sync_interval_minutes: syncInterval,
      last_sync_at: Number(settings.last_sync_at) || 0,
      sync_status: asText(settings.sync_status).slice(0, 160),
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    Object.keys(settings || {}).forEach((key) => {
      if (SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
    });

    return safe;
  }

  function apiById(apiId) {
    const id = asText(apiId).toLowerCase();
    return API_REGISTRY.find((api) => api.id === id) || null;
  }

  function keyVaultBindingById(connectionId) {
    const id = asText(connectionId).toLowerCase();
    return KEY_VAULT_BINDINGS.find((binding) => binding.id === id) || null;
  }

  function sanitizeKeyVaultBinding(settings = {}) {
    const definition = keyVaultBindingById(settings.connection_id || settings.provider_id) || KEY_VAULT_BINDINGS[0];
    const safe = {
      connection_id: definition.id,
      vault_name: asText(settings.vault_name).slice(0, 90),
      tenant_id: asText(settings.tenant_id).slice(0, 90),
      secret_name: asText(settings.secret_name === undefined ? definition.defaultSecretName : settings.secret_name).slice(0, 90),
      certificate_name: asText(settings.certificate_name === undefined ? definition.defaultCertificateName : settings.certificate_name).slice(0, 90),
      key_name: asText(settings.key_name === undefined ? definition.defaultKeyName : settings.key_name).slice(0, 90),
      api_reference_name: asText(settings.api_reference_name === undefined ? definition.defaultApiReferenceName : settings.api_reference_name).slice(0, 90),
      status: KEY_VAULT_STATUSES.has(asText(settings.status).toLowerCase())
        ? asText(settings.status).toLowerCase()
        : definition.status,
      background_sync_enabled: Boolean(settings.background_sync_enabled),
      sync_status: asText(settings.sync_status).slice(0, 180),
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    Object.keys(settings || {}).forEach((key) => {
      if (KEY_VAULT_RAW_SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
    });

    return safe;
  }

  function sanitizeKeyVaultPlan(settings = {}) {
    const azure = apiById("azure_key_vault") || {};
    const publicValues = azure.public_values || {};
    const vaultName = asText(settings.vault_name === undefined ? publicValues.vault_name : settings.vault_name).slice(0, 90);
    const plan = {
      vault_name: vaultName,
      tenant_id: asText(settings.tenant_id === undefined ? publicValues.tenant_id : settings.tenant_id).slice(0, 90),
      tenant_name: asText(settings.tenant_name === undefined ? publicValues.tenant_name : settings.tenant_name).slice(0, 90),
      primary_domain: asText(settings.primary_domain === undefined ? publicValues.primary_domain : settings.primary_domain).slice(0, 120),
      license: asText(settings.license === undefined ? publicValues.license : settings.license).slice(0, 90),
      subscription_id: asText(settings.subscription_id).slice(0, 90),
      bindings: {},
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    KEY_VAULT_BINDINGS.forEach((definition) => {
      const supplied = settings.bindings && settings.bindings[definition.id] ? settings.bindings[definition.id] : {};
      plan.bindings[definition.id] = sanitizeKeyVaultBinding({
        ...supplied,
        connection_id: definition.id,
        vault_name: vaultName || supplied.vault_name || "",
        tenant_id: plan.tenant_id,
      });
      if (plan.bindings[definition.id].rejected_secret_fields) plan.rejected_secret_fields = true;
    });

    Object.keys(settings || {}).forEach((key) => {
      if (SECRET_FIELD_PATTERN.test(key)) plan.rejected_secret_fields = true;
    });

    return plan;
  }

  function sanitizeApiSettings(settings = {}) {
    const api = apiById(settings.api_id) || API_REGISTRY[0];
    const safe = {
      api_id: api.id,
      status: asText(settings.status).toLowerCase() || api.status,
      account_label: asText(settings.account_label).slice(0, 90),
      vault_name: asText(settings.vault_name).slice(0, 90),
      tenant_id: asText(settings.tenant_id).slice(0, 90),
      tenant_name: asText(settings.tenant_name).slice(0, 90),
      primary_domain: asText(settings.primary_domain).slice(0, 120),
      license: asText(settings.license).slice(0, 90),
      subscription_id: asText(settings.subscription_id).slice(0, 90),
      certificate_name: asText(settings.certificate_name).slice(0, 90),
      secret_name: asText(settings.secret_name).slice(0, 90),
      background_sync_enabled: Boolean(settings.background_sync_enabled),
      sync_status: asText(settings.sync_status).slice(0, 180),
      last_sync_at: Number(settings.last_sync_at) || 0,
      updated_at: Number(settings.updated_at) || Date.now(),
    };

    Object.keys(settings || {}).forEach((key) => {
      if (SECRET_FIELD_PATTERN.test(key)) safe.rejected_secret_fields = true;
    });

    return safe;
  }

  function senderAllowed(sender, allowlist) {
    const senderText = asText(sender).toLowerCase();
    const rules = asText(allowlist || defaultEmailAllowlist())
      .toLowerCase()
      .split(/[\s,;]+/)
      .map((rule) => rule.trim().replace(/^@/, ""))
      .filter(Boolean);
    return rules.some((rule) => senderText === rule || senderText.endsWith("@" + rule) || senderText.includes("@" + rule));
  }

  function providerForSender(sender) {
    const senderText = asText(sender).toLowerCase();
    return PROVIDERS.find((provider) =>
      (provider.emailDomains || []).some((domain) => senderText.includes("@" + domain) || senderText.endsWith(domain)),
    ) || null;
  }

  function parseEmailText(text, settings = {}) {
    const safeSettings = sanitizeEmailSyncSettings(settings);
    const raw = String(text || "");
    const from = (raw.match(/^from:\s*(.+)$/im) || [])[1] || "";
    const subject = (raw.match(/^subject:\s*(.+)$/im) || [])[1] || "";
    if (from && !senderAllowed(from, safeSettings.sender_allowlist)) {
      return {
        ignored: true,
        reason: "sender_not_allowed",
        from: asText(from),
        subject: asText(subject),
      };
    }

    const provider = providerForSender(from) || providerById(settings.provider_id);
    const parsedJobs = parseSharedJobs(raw, provider.id)
      .filter((job) => job.address || job.pay_cents || /\b(available|assigned|claimed|payment|due|deadline)\b/i.test(job.source_text || ""))
      .map((job) => ({
        ...job,
        source: "email-import",
        email_from: asText(from),
        email_subject: asText(subject),
      }));

    return {
      ignored: false,
      from: asText(from),
      subject: asText(subject),
      provider_id: provider.id,
      jobs: parsedJobs,
    };
  }

  function nextSyncAt(connection, now = Date.now()) {
    const safe = sanitizeConnectionSettings(connection);
    if (!safe.background_sync_enabled || !safe.sync_interval_minutes) return 0;
    const last = safe.last_sync_at || now;
    return last + safe.sync_interval_minutes * 60 * 1000;
  }

  function connectionLabel(connection) {
    const status = safeConnectionStatus(connection?.status);
    if (status === "signed_in_external") return "Connected on this phone/browser";
    if (status === "needs_login") return "Needs sign-in";
    return "Not connected yet";
  }

  function normalizeStatus(value) {
    const text = asText(value).toLowerCase();
    if (
      text.includes("needs completion") ||
      text.includes("need to complete") ||
      text.includes("needs to complete") ||
      text.includes("overdue") ||
      text.includes("due soon") ||
      text.includes("late") ||
      text.includes("in progress")
    ) return "needs_completion";
    if (
      text.includes("submitted") ||
      text.includes("applied") ||
      text.includes("requested") ||
      text.includes("apply required") ||
      text.includes("application required") ||
      text.includes("requires application") ||
      text.includes("must apply")
    ) return "applied";
    if (/\b(paid|complete|completed|done|passed)\b/.test(text)) return "completed";
    if (text.includes("claimed") || text.includes("reserved") || text.includes("planned") || text.includes("accepted") || text.includes("assigned")) return "assigned";
    if (text.includes("available") || text.includes("open") || text.includes("claim now") || text.includes("open to claim")) return "available";
    return text || "available";
  }

  function isOpenAvailableJob(job) {
    const status = normalizeStatus(job?.status);
    return status === "available" || status === "open";
  }

  function isAssignedJob(job) {
    const status = normalizeStatus(job?.status);
    return status === "assigned" || status === "planned";
  }

  function isNeedsCompletionJob(job) {
    return normalizeStatus(job?.status) === "needs_completion";
  }

  function isCompletedJob(job) {
    return normalizeStatus(job?.status) === "completed";
  }

  function isRouteVisibleJob(job) {
    return isOpenAvailableJob(job) || isAssignedJob(job) || isNeedsCompletionJob(job);
  }

  function moneyToCents(value) {
    const match = asText(value).match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    return match ? Math.round(Number(match[1]) * 100) : 0;
  }

  function centsLabel(cents) {
    const value = Number(cents);
    return Number.isFinite(value) && value > 0 ? "$" + (value / 100).toFixed(2) : "Pay not listed";
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function positiveMinutes(value) {
    const number = positiveNumber(value);
    return number ? Math.max(5, Math.round(number)) : null;
  }

  function workTimeLabel(job) {
    const minutes = positiveMinutes(job?.minutes);
    return minutes ? minutes + " min" : asText(job?.duration_text) || "Work time not listed";
  }

  function minutesFrom(value) {
    const text = asText(value).toLowerCase();
    const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)/);
    if (minuteMatch) return Math.max(5, Math.round(Number(minuteMatch[1])));
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs)/);
    if (hourMatch) return Math.max(15, Math.round(Number(hourMatch[1]) * 60));
    return 30;
  }

  function normalizeAddress(value) {
    return asText(value)
      .toLowerCase()
      .replace(/\b(highway)\b/g, "hwy")
      .replace(/\b(street)\b/g, "st")
      .replace(/\b(avenue)\b/g, "ave")
      .replace(/\b(road)\b/g, "rd")
      .replace(/\b(lane)\b/g, "ln")
      .replace(/\b(drive)\b/g, "dr")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function jobId(job) {
    return [
      job.provider_id,
      asText(job.external_id).toLowerCase(),
      normalizeAddress(job.address),
      asText(job.title).toLowerCase(),
      Number(job.pay_cents) || 0,
    ]
      .filter(Boolean)
      .join(":")
      .slice(0, 180);
  }

  function lineValue(lines, labels) {
    for (const line of lines) {
      for (const label of labels) {
        const pattern = label instanceof RegExp ? label : new RegExp("^" + label + "\\s*[:\\-]\\s*(.+)$", "i");
        const match = line.match(pattern);
        if (match) return asText(match[1] || match[0]);
      }
    }
    return "";
  }

  function isProviderHeading(line, provider) {
    const lower = asText(line).toLowerCase();
    return lower === provider.id.replace(/_/g, " ") || lower === provider.label.toLowerCase();
  }

  function isMetadataLine(line) {
    return /^(store|location|address|site|pay|fee|reward|due|deadline|start by|complete by|finish by|time to complete|estimated duration|duration|work time|timer after accept|photos required|purchase required|requirements|status|accepted|payment)\b/i.test(line);
  }

  function firstTitleLine(lines, provider) {
    return (
      lines.find((line) => !isProviderHeading(line, provider) && !isMetadataLine(line) && !STREET_PATTERN.test(line) && !/\$\s*\d/.test(line)) ||
      provider.label + " job"
    );
  }

  function firstAddress(lines, block) {
    const explicitAddress = lineValue(lines, [
      /^(?:address|site address|job address)\s*[:\-]\s*(.+)$/i,
    ]);
    if (explicitAddress) return explicitAddress;

    const locationLine = lineValue(lines, [/^location\s*[:\-]\s*(.+)$/i]);
    if (locationLine && STREET_PATTERN.test(locationLine)) return locationLine;

    return asText((block.match(STREET_PATTERN) || [])[0] || "");
  }

  function firstLocationName(lines, address) {
    const store = lineValue(lines, [/^store\s*[:\-]\s*(.+)$/i]);
    if (store) return store;

    const location = lineValue(lines, [/^location\s*[:\-]\s*(.+)$/i]);
    if (location && !STREET_PATTERN.test(location) && normalizeAddress(location) !== normalizeAddress(address)) return location;

    return "";
  }

  function parseIntegerField(lines, labels) {
    const value = lineValue(lines, labels);
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function parsePurchaseRequired(lines) {
    const value = lineValue(lines, [/^purchase required\s*[:\-]\s*(.+)$/i]);
    if (!value) return null;
    if (/^(no|none|false|not required|n\/a)\b/i.test(value)) return false;
    if (/^(yes|true|required)\b/i.test(value)) return true;
    return null;
  }

  function parseSharedJobs(text, providerId = "survey_merchandiser") {
    const provider = providerById(providerId);
    const blocks = String(text || "")
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).map(asText).filter(Boolean);
      const address = firstAddress(lines, block);
      const locationName = firstLocationName(lines, address);
      const pay = lineValue(lines, [/^(?:pay|fee|reward|payout)\s*[:\-]?\s*(.+)$/i]) || (block.match(/\$\s*\d+(?:\.\d{1,2})?/) || [])[0] || "";
      const dueLine =
        lineValue(lines, [
          /^(?:due|deadline|complete by|finish by|end by|must complete by|expires|expiration)\s*[:\-]\s*(.+)$/i,
        ]) ||
        lines.find((line) => /\b(due|deadline|date|arrival|window)\b/i.test(line)) ||
        "";
      const paymentLine = lines.find((line) => /\b(payment|payout|paid|payable|pending|approved|bonus|expense)\b/i.test(line)) || "";
      const title = firstTitleLine(lines, provider);
      const statusLine =
        lineValue(lines, [/^status\s*[:\-]\s*(.+)$/i]) ||
        lines.find((line) => /^(available|open to claim|open|claim now|claimed|assigned|accepted|reserved|planned|needs completion|need to complete|due soon|overdue|late|in progress|apply required|application required|requires application|must apply|applied|requested)\b/i.test(line)) ||
        "available";
      const workMinutes =
        lineValue(lines, [/^(?:time to complete|estimated duration|duration|work time|estimated time)\s*[:\-]\s*(.+)$/i]) ||
        block;
      const timerText = lineValue(lines, [/^timer after accept\s*[:\-]\s*(.+)$/i]);
      const acceptedAt = lineValue(lines, [/^accepted\s*[:\-]\s*(.+)$/i]);
      const requirements = lineValue(lines, [/^requirements?\s*[:\-]\s*(.+)$/i]);
      const photosRequired = parseIntegerField(lines, [/^photos required\s*[:\-]\s*(.+)$/i]);
      const purchaseRequired = parsePurchaseRequired(lines);
      const job = {
        id: "",
        provider_id: provider.id,
        provider_label: provider.label,
        title,
        location_name: locationName,
        address: asText(address),
        pay_cents: moneyToCents(pay),
        due: dueLine,
        accepted_at: acceptedAt,
        minutes: minutesFrom(workMinutes),
        timer_minutes: timerText ? minutesFrom(timerText) : null,
        photos_required: photosRequired,
        purchase_required: purchaseRequired,
        requirements,
        status: normalizeStatus(statusLine),
        payment_status: asText(paymentLine),
        source: "phone-app-import",
        source_text: block,
        order: index + 1,
      };
      job.id = jobId(job) || provider.id + ":" + Date.now() + ":" + index;
      return job;
    });
  }

  function parsePaymentCenterText(text, providerId = "survey_merchandiser") {
    const provider = providerById(providerId);
    const blocks = String(text || "")
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean);

    return blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).map(asText).filter(Boolean);
      const amount = (block.match(/\$\s*\d+(?:\.\d{1,2})?/) || [])[0] || "";
      const statusLine = lines.find((line) => /\b(pending|approved|paid|payable|rejected|processing|submitted)\b/i.test(line)) || "pending";
      const dateLine = lines.find((line) => /\b(today|tomorrow|due|paid|approved|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(line)) || "";
      const title = lines.find((line) => line !== amount && line !== statusLine && line !== dateLine) || provider.label + " payment";
      return {
        id: [provider.id, asText(title).toLowerCase(), moneyToCents(amount), index].join(":"),
        provider_id: provider.id,
        provider_label: provider.label,
        title,
        amount_cents: moneyToCents(amount),
        status: normalizeStatus(statusLine),
        payment_status: asText(statusLine),
        date: asText(dateLine),
        source: "payment-center-import",
        source_text: block,
      };
    });
  }

  function routeJobCoordinates(data) {
    const byJob = new Map();
    const byAddress = new Map();

    Object.values(data?.sections || {}).forEach((section) => {
      (section.legs || []).forEach((leg) => {
        const stop = leg.alight_stop || leg.board_stop;
        if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return;
        const point = {
          lat: stop.lat,
          lon: stop.lon,
          label: leg.destination || stop.name,
          stopName: stop.name,
          route: leg.route,
        };

        [leg.job, leg.extra_job].filter(Boolean).forEach((id) => byJob.set(id, point));
        if (leg.destination) byAddress.set(normalizeAddress(leg.destination), point);
      });
    });

    Object.entries(data?.jobs || {}).forEach(([id, job]) => {
      const point = byJob.get(id);
      if (point && job?.address) byAddress.set(normalizeAddress(job.address), point);
    });

    return { byJob, byAddress };
  }

  function coordinateForJob(job, data) {
    const lat = Number(job?.lat);
    const lon = Number(job?.lon ?? job?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, source: "imported coordinates" };

    const { byAddress } = routeJobCoordinates(data);
    const normalized = normalizeAddress(job?.address);
    if (!normalized) return null;

    if (byAddress.has(normalized)) {
      return { ...byAddress.get(normalized), source: "matched Nashville planner address" };
    }

    for (const [knownAddress, point] of byAddress.entries()) {
      if (knownAddress.includes(normalized) || normalized.includes(knownAddress)) {
        return { ...point, source: "matched Nashville planner address" };
      }
    }

    return null;
  }

  function haversineMiles(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const toRad = (degrees) => (degrees * Math.PI) / 180;
    const earthMiles = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthMiles * Math.asin(Math.sqrt(h));
  }

  function scoreJob(job, data, origin) {
    const coord = coordinateForJob(job, data);
    const mappedDistanceMiles = coord && origin ? haversineMiles(origin, coord) : Number.POSITIVE_INFINITY;
    const sourceDistanceMiles = positiveNumber(job?.distance_miles);
    const distanceMiles = Number.isFinite(mappedDistanceMiles)
      ? mappedDistanceMiles
      : sourceDistanceMiles ?? Number.POSITIVE_INFINITY;
    const payCents = Number(job?.pay_cents) || 0;
    const minutes = positiveMinutes(job?.minutes);
    const scoringMinutes = minutes || 30;
    const hourlyCents = Math.round(payCents / (scoringMinutes / 60));
    const timeText = minutes ? minutes + " min" : "work time not listed";
    const distanceText = Number.isFinite(mappedDistanceMiles)
      ? distanceMiles.toFixed(1) + " mi from you"
      : sourceDistanceMiles
        ? sourceDistanceMiles.toFixed(1) + " mi from provider app"
        : "needs verified location";
    const mappedBoost = coord ? 25 : sourceDistanceMiles ? -5 : -45;
    const distancePenalty = Number.isFinite(distanceMiles) ? distanceMiles * 4 : 20;
    const score = payCents / 100 + hourlyCents / 300 + mappedBoost - distancePenalty;

    return {
      ...job,
      coordinate: coord,
      distance_miles: Number.isFinite(distanceMiles) ? distanceMiles : null,
      hourly_cents: hourlyCents,
      recommendation_score: Math.round(score * 10) / 10,
      recommendation_reason: centsLabel(payCents) + ", " + timeText + ", " + distanceText,
    };
  }

  function routeStatusPriority(job) {
    if (isNeedsCompletionJob(job)) return 10000;
    if (isAssignedJob(job)) return 5000;
    if (isOpenAvailableJob(job)) return 1000;
    return 0;
  }

  function jobMapColor(job) {
    if (isNeedsCompletionJob(job)) return "red";
    if (isAssignedJob(job)) return "yellow";
    if (isOpenAvailableJob(job)) return "green";
    if (isCompletedJob(job)) return "gray";
    return "gray";
  }

  function providerMatches(job, provider) {
    return provider === "all" || provider === "" || job?.provider_id === provider;
  }

  function statusMatches(job, requestedStatus) {
    return requestedStatus === "all" || normalizeStatus(job?.status) === requestedStatus;
  }

  function jobsForMap(jobs, filters = {}) {
    const provider = asText(filters.provider_id || filters.provider || "all").toLowerCase();
    const requestedStatus = normalizeStatus(filters.status || "all");

    return (Array.isArray(jobs) ? jobs : [])
      .filter(isRouteVisibleJob)
      .filter((job) => providerMatches(job, provider))
      .filter((job) => statusMatches(job, requestedStatus))
      .map((job) => ({
        ...job,
        status: normalizeStatus(job.status),
        map_color: jobMapColor(job),
      }));
  }

  function jobsForTab(jobs, filters = {}) {
    const provider = asText(filters.provider_id || filters.provider || "all").toLowerCase();
    const requestedStatus = normalizeStatus(filters.status || "all");
    const tab = asText(filters.tab || "open").toLowerCase();

    return (Array.isArray(jobs) ? jobs : [])
      .filter((job) => providerMatches(job, provider))
      .filter((job) => statusMatches(job, requestedStatus))
      .filter((job) => {
        if (tab === "completed") return isCompletedJob(job);
        if (tab === "accepted" || tab === "claimed") return isAssignedJob(job) || isNeedsCompletionJob(job);
        return isOpenAvailableJob(job);
      })
      .map((job) => ({
        ...job,
        status: normalizeStatus(job.status),
        map_color: jobMapColor(job),
      }));
  }

  function markJobsCompleted(jobs, options = {}) {
    const completedAt = Number(options.completed_at) || Date.now();
    const completionReason = asText(options.completion_reason || "Moved to completed");
    return (Array.isArray(jobs) ? jobs : []).map((job) => ({
      ...job,
      status: "completed",
      completed_at: Number(job?.completed_at) || completedAt,
      completion_reason: asText(job?.completion_reason) || completionReason,
      updated_at: Number(job?.updated_at) || completedAt,
      map_color: "gray",
    }));
  }

  function moveJobsToFolder(jobs, selectedIds = [], folder = "completed", options = {}) {
    const ids = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(asText).filter(Boolean));
    const targetFolder = asText(folder).toLowerCase();
    const updatedAt = Number(options.updated_at) || Date.now();
    if (!ids.size) return Array.isArray(jobs) ? jobs.slice() : [];

    return (Array.isArray(jobs) ? jobs : []).map((job) => {
      if (!ids.has(asText(job?.id))) return job;

      if (targetFolder === "claimed" || targetFolder === "assigned") {
        return {
          ...job,
          status: "assigned",
          claimed_at: asText(job?.claimed_at) || new Date(updatedAt).toISOString(),
          updated_at: updatedAt,
          map_color: "yellow",
        };
      }

      if (targetFolder === "pending_payment") {
        return {
          ...job,
          status: "completed",
          completed_at: Number(job?.completed_at) || updatedAt,
          payment_status: "Pending payment",
          updated_at: updatedAt,
          map_color: "gray",
        };
      }

      return {
        ...job,
        status: "completed",
        completed_at: Number(job?.completed_at) || updatedAt,
        completion_reason: asText(job?.completion_reason) || "Moved to completed",
        updated_at: updatedAt,
        map_color: "gray",
      };
    });
  }

  function recommendJobs(jobs, data, origin) {
    return (Array.isArray(jobs) ? jobs : [])
      .filter(isOpenAvailableJob)
      .map((job) => scoreJob(job, data, origin))
      .sort((a, b) => b.recommendation_score - a.recommendation_score);
  }

  function recommendRouteJobs(jobs, data, origin, filters = {}) {
    const routeJobs = filters.tab
      ? jobsForTab(jobs, filters).filter(isRouteVisibleJob)
      : jobsForMap(jobs, filters);

    return routeJobs
      .map((job) => {
        const scored = scoreJob(job, data, origin);
        const priority = routeStatusPriority(job);
        return {
          ...scored,
          map_color: jobMapColor(job),
          route_status_priority: priority,
          recommendation_score: Math.round((scored.recommendation_score + priority) * 10) / 10,
        };
      })
      .sort((a, b) => b.recommendation_score - a.recommendation_score);
  }

  return {
    API_REGISTRY,
    KEY_VAULT_BINDINGS,
    KEY_VAULT_STATUSES,
    PROVIDERS,
    CONNECTION_SETUP,
    EMAIL_PERMISSION_OPTIONS,
    SYNC_INTERVALS,
    centsLabel,
    connectionLabel,
    coordinateForJob,
    isAssignedJob,
    isCompletedJob,
    isNeedsCompletionJob,
    isOpenAvailableJob,
    isRouteVisibleJob,
    jobMapColor,
    jobsForTab,
    jobsForMap,
    markJobsCompleted,
    moveJobsToFolder,
    moneyToCents,
    normalizeAddress,
    normalizeStatus,
    parseSharedJobs,
    parsePaymentCenterText,
    parseEmailText,
    providerById,
    apiById,
    keyVaultBindingById,
    sanitizeKeyVaultBinding,
    sanitizeKeyVaultPlan,
    sanitizeApiSettings,
    sanitizeEmailSyncSettings,
    senderAllowed,
    recommendJobs,
    recommendRouteJobs,
    nextSyncAt,
    sanitizeConnectionSettings,
    scoreJob,
    workTimeLabel,
  };
});
