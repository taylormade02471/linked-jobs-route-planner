const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..", "..", "..");

test("provider reads allow private LAN phones while unauthenticated writes remain loopback-only", () => {
  const { isLoopbackAddress, isPrivateNetworkAddress } = require(
    path.join(projectRoot, "backend", "network-access.js"),
  );

  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.25"), false);

  for (const address of [
    "127.0.0.1",
    "::1",
    "::ffff:192.168.1.25",
    "10.42.0.8",
    "172.16.0.2",
    "172.31.255.2",
    "fe80::1",
    "fd12::25",
  ]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }

  for (const address of ["", "8.8.8.8", "172.32.0.2", "2001:4860:4860::8888"]) {
    assert.equal(isPrivateNetworkAddress(address), false, address);
  }
});
