const SOURCE_URL = "http://127.0.0.1:3300/api/provider-jobs";

function isMegaLogSender(sender) {
  try {
    const url = new URL(sender?.url || "");
    return url.origin === "https://www.jobslingerplus.com" && /^\/MegaLog(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function postSafeJobs(payload) {
  if (!payload || !Array.isArray(payload.jobs) || !payload.jobs.length) {
    return { ok: false, error: "No safe jobs supplied." };
  }
  try {
    const response = await fetch(SOURCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, result: await response.json() };
  } catch {
    return { ok: false, error: "Local planner is unavailable." };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "sync-provider-jobs" || !isMegaLogSender(sender)) return false;
  postSafeJobs(message.payload).then(sendResponse);
  return true;
});
