function normalizedAddress(value) {
  const address = String(value || "").trim().toLowerCase().split("%")[0];
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function ipv4Parts(value) {
  const parts = normalizedAddress(value).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isLoopbackAddress(value) {
  const address = normalizedAddress(value);
  return address === "::1" || address === "127.0.0.1";
}

function isPrivateNetworkAddress(value) {
  if (isLoopbackAddress(value)) return true;
  const address = normalizedAddress(value);
  const parts = ipv4Parts(address);
  if (parts) {
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }
  return /^(fc|fd)/.test(address) || /^fe[89ab]/.test(address);
}

module.exports = {
  isLoopbackAddress,
  isPrivateNetworkAddress,
};
