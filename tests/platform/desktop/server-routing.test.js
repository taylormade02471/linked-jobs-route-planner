const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..", "..", "..");

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on("error", reject);
  });
}

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 8_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Server listening on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited before it started (${code}). Output: ${output}`));
    });
  });
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
}

test("desktop server opens the Nashville planner at root and retains the old dashboard as legacy", async (t) => {
  const port = 45000 + Math.floor(Math.random() * 1_000);
  const server = spawn(process.execPath, ["backend/server_live.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      APP_USER: "test-user",
      APP_PASSWORD: "test-password",
      WEGO_VEHICLE_POSITION_URL: "data:application/octet-stream;base64,AQID",
      WEGO_TRIP_UPDATES_URL: "data:application/octet-stream;base64,AQID",
      WEGO_ALERTS_URL: "data:application/octet-stream;base64,AQID",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => stopServer(server));
  await waitForServer(server);

  const root = await request(port, "/");
  assert.equal(root.status, 200);
  assert.match(root.body, /Nashville Live Audit Transit Planner/);
  assert.match(root.body, /id="planFurthestFirstRoute"/);
  assert.match(root.body, /<link rel="icon" href="data:,">/);

  const routeCore = await request(port, "/route-planner-core.js?v=20260925-furthest-first");
  assert.equal(routeCore.status, 200);
  assert.match(routeCore.body, /planFurthestFirstReturnSweep/);

  const localProviderJobs = await request(port, "/api/provider-jobs");
  assert.equal(localProviderJobs.status, 200);
  assert.deepEqual(JSON.parse(localProviderJobs.body), { jobs: [] });

  const liveTransit = await request(port, "/api/wego-live");
  assert.equal(liveTransit.status, 200);
  assert.deepEqual(
    {
      vehiclePositions: JSON.parse(liveTransit.body).vehiclePositions,
      tripUpdates: JSON.parse(liveTransit.body).tripUpdates,
      alerts: JSON.parse(liveTransit.body).alerts,
    },
    { vehiclePositions: "AQID", tripUpdates: "AQID", alerts: "AQID" },
  );
  assert.ok(Date.parse(JSON.parse(liveTransit.body).fetchedAt));

  const legacy = await request(port, "/legacy/");
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.location, "/login");
});
