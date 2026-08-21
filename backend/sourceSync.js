function buildExtensionSyncStatus({ syncedJobCount, pageUrl, nowIso = new Date().toISOString() }) {
  const count = Number.isFinite(syncedJobCount) ? syncedJobCount : 0;
  const label = count === 1 ? "job" : "jobs";
  const isMegaLog = /\/MegaLog(?:[/?#]|$)/i.test(String(pageUrl || ""));

  return {
    state: "live",
    message: `Extension synced ${count} ${label}${isMegaLog ? " from MegaLog" : ""}`,
    lastScrapeAt: nowIso,
    lastError: "",
    transferMode: "browser-extension",
    pageUrl: String(pageUrl || ""),
  };
}

module.exports = {
  buildExtensionSyncStatus,
};
