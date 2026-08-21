const fs = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");

test("desktop server module does not start live browser polling on import", async () => {
  const serverSource = await fs.readFile("backend/server.js", "utf8");
  assert.equal(serverSource.includes("startLivePolling();"), false);
});

test("desktop entrypoint remains server_live.js", async () => {
  const pkg = JSON.parse(await fs.readFile("backend/package.json", "utf8"));
  assert.equal(pkg.main, "server_live.js");
});

