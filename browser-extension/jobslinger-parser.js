(function exposeJobSlingerParser(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.JobSlingerParser = api;
})(typeof globalThis === "object" ? globalThis : this, function createJobSlingerParser() {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function lines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean);
  }

  function cents(value) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
  }

  function field(text, label) {
    const match = String(text || "").match(new RegExp(`${label}\\s*:?\\s*([^\\n\\r]+)`, "i"));
    return clean(match && match[1]);
  }

  function stableId(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function safeHttpUrl(value, expectedHost) {
    try {
      const url = new URL(String(value || ""));
      if (!/^https?:$/.test(url.protocol)) return "";
      if (expectedHost && url.hostname !== expectedHost) return "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function addressFromMapUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return clean(url.searchParams.get("daddr"));
    } catch {
      return "";
    }
  }

  function statusFromText(text) {
    const labeled = String(text || "").match(
      /(?:^|\n)\s*(?:(?:job|assignment)\s+)?status\s*:?\s*([^\n\r]+)/i,
    );
    const standalone = lines(text).find((line) =>
      /^(paid|completed|complete|done|assigned|accepted|claimed|reserved|overdue|needs completion|in progress|available|open)$/i.test(
        line,
      ),
    );
    const value = clean((labeled && labeled[1]) || standalone).toLowerCase();
    if (/\b(paid|completed|complete|done)\b/.test(value)) return "completed";
    if (/\b(assigned|accepted|claimed|reserved)\b/.test(value)) return "assigned";
    if (/\b(overdue|needs completion|in progress)\b/.test(value)) return "needs_completion";
    return "available";
  }

  function titleFromText(text, address) {
    const addressStart = clean(address).split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    const skipped = /^(survey|due|submit due|do not shop before|shop pay|bonus|expenses|special expenses|details|help|contact)\b/i;
    return (
      lines(text).find((line) => !skipped.test(line) && !line.toLowerCase().startsWith(addressStart)) ||
      "JobSlinger assignment"
    );
  }

  function parseMegaLogCard(input = {}) {
    const text = String(input.text || "");
    const address = addressFromMapUrl(input.mapUrl) || field(text, "Address");
    if (!address) return null;
    const detailsUrl = safeHttpUrl(input.detailsUrl, "www.jobslingerplus.com");
    const title = titleFromText(text, address);
    const due = field(text, "Due");
    const shopPay = field(text, "Shop Pay") || field(text, "Pay");
    const status = statusFromText(text);
    const externalId = stableId([detailsUrl, title, address].join("|"));

    return {
      id: `jobslinger:${externalId}`,
      provider_id: "jobslinger_megalog",
      provider_label: "JobSlinger MegaLog",
      connector_id: "jobslinger-megalog-browser-extension",
      external_id: externalId,
      title,
      address,
      pay_cents: cents(shopPay),
      due,
      status,
      payment_status: status === "completed" ? "awaiting provider payment status" : "",
      requirements: lines(text).join("\n").slice(0, 8000),
      details_url: detailsUrl,
      source: "signed-in-browser-extension",
      order: Number(input.index) + 1,
      updated_at: Date.now(),
    };
  }

  return {
    addressFromMapUrl,
    parseMegaLogCard,
  };
});
