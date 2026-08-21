const STATUS_RANK = {
  available: 10,
  active: 20,
  planned: 30,
  submitted: 40,
  awaiting_payment: 50,
  paid: 60,
  completed: 70,
};

function normalizeReconcileStatus(value) {
  const status = String(value || "").toLowerCase().trim();
  if (status === "paid") return "completed";
  if (status.includes("paid")) return "completed";
  if (status.includes("complete") || status.includes("done")) return "completed";
  if (status.includes("awaiting")) return "awaiting_payment";
  if (status.includes("submitted")) return "awaiting_payment";
  if (status.includes("planned")) return "planned";
  if (status.includes("available")) return "available";
  return status || "active";
}

function reconcileStatus(localJob, incomingJob) {
  const local = normalizeReconcileStatus(localJob && localJob.status);
  const incoming = normalizeReconcileStatus(incomingJob && incomingJob.status);
  return (STATUS_RANK[incoming] || 0) >= (STATUS_RANK[local] || 0) ? incoming : local;
}

module.exports = {
  reconcileStatus,
};
