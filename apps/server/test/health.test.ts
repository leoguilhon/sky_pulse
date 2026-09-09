import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
test("readiness succeeds when the database is reachable", async (context) => {
  const app = createApp(async () => {}, false);
  context.after(() => app.close());
  const response = await app.inject("/api/health/ready");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", database: "connected" });
});
test("database failure affects readiness, but liveness remains available", async (context) => {
  const app = createApp(async () => {
    throw new Error("private connection details");
  }, false);
  context.after(() => app.close());
  const response = await app.inject("/api/health/ready");
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "unavailable",
    database: "unavailable",
  });
  assert.equal((await app.inject("/api/health/live")).statusCode, 200);
});
