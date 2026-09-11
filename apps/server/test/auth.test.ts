import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createApp } from "../src/app.js";
import { tokenDigest } from "../src/auth/routes.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import type { AuthStore, Session } from "../src/auth/store.js";
import type { AircraftService } from "../src/aircraft/service.js";
import { WORLD_REGION } from "../src/aircraft/types.js";

const password = "test-only-password-42";
const user = {
  id: "ee077cfc-86ea-4856-a0f7-81b109c27dfe",
  email: "pilot@example.test",
  passwordHash: await hashPassword(password),
};
const headers = { origin: "http://localhost:8080", "x-skypulse-request": "1" };
function setup(
  context: TestContext,
  secureCookie = false,
  aircraft?: AircraftService,
) {
  const sessions = new Map<string, Session>();
  const store: AuthStore = {
    async findUser(email) {
      return email === user.email ? user : undefined;
    },
    async createSession(_id, hash, expiresAt, previous) {
      if (previous) sessions.delete(previous);
      sessions.set(hash, {
        user: { id: user.id, email: user.email },
        expiresAt: expiresAt.toISOString(),
      });
    },
    async findSession(hash) {
      return sessions.get(hash);
    },
    async revokeSession(hash) {
      sessions.delete(hash);
    },
  };
  const app = createApp(
    async () => {},
    false,
    {
      store,
      origin: headers.origin,
      secureCookie,
      sessionSeconds: 3600,
    },
    aircraft,
  );
  context.after(() => app.close());
  const login = (email = user.email, value = password, cookie?: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
      payload: { email, password: value },
    });
  return { app, sessions, store, login };
}

test("live aircraft are available only to authenticated users", async (context) => {
  const aircraft: AircraftService = {
    region: WORLD_REGION,
    async getRoute(id) {
      return id === "e49001"
        ? {
            status: "no-callsign",
            callsign: null,
            source: "adsbdb",
            fetchedAt: "2026-09-10T12:00:00Z",
            origin: null,
            destination: null,
            via: [],
            airline: null,
            flightNumber: null,
          }
        : null;
    },
    async getAircraft() {
      return {
        aircraft: [],
        observedAt: "2026-09-10T12:00:00.000Z",
        fetchedAt: "2026-09-10T12:00:01.000Z",
        provider: "Test provider",
        cached: false,
        stale: false,
      };
    },
  };
  const { app, login } = setup(context, false, aircraft);
  assert.equal((await app.inject("/api/aircraft")).statusCode, 401);
  assert.equal(
    (await app.inject("/api/aircraft/e49001/route")).statusCode,
    401,
  );
  const response = await login();
  const cookie = `${response.cookies[0]!.name}=${response.cookies[0]!.value}`;
  const live = await app.inject({ url: "/api/aircraft", headers: { cookie } });
  assert.equal(live.statusCode, 200);
  assert.equal(
    (
      await app.inject({
        url: "/api/aircraft/e49001/route",
        headers: { cookie },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/aircraft/xxxxxx/route",
        headers: { cookie },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/aircraft/e49002/route",
        headers: { cookie },
      })
    ).statusCode,
    404,
  );
  assert.equal(live.json().provider, "Test provider");
  assert.equal(live.json().region.name, "Worldwide");
});

test("password hashes use random salts and verify without storing plaintext", async () => {
  const other = await hashPassword(password);
  assert.notEqual(other, user.passwordHash);
  assert.ok(!other.includes(password));
  assert.equal(await verifyPassword(password, other), true);
  assert.equal(await verifyPassword("incorrect", other), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});

test("login normalizes email, keeps tokens out of JSON, and authorizes protected data", async (context) => {
  const { app, sessions, login } = setup(context);
  const response = await login(" PILOT@EXAMPLE.TEST ");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().user, { id: user.id, email: user.email });
  assert.deepEqual(Object.keys(response.json()).sort(), ["expiresAt", "user"]);
  const cookie = response.cookies[0]!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Strict");
  assert.equal(cookie.path, "/");
  assert.ok(sessions.has(tokenDigest(cookie.value)));
  assert.ok(!sessions.has(cookie.value));
  const authenticated = { cookie: `${cookie.name}=${cookie.value}` };
  assert.equal(
    (await app.inject({ url: "/api/workspace", headers: authenticated }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({ url: "/api/auth/session", headers: authenticated })
    ).json().user.email,
    user.email,
  );
  assert.equal(response.headers["cache-control"], "no-store");
});

test("HTTPS uses a secure host-only cookie", async (context) => {
  const { login } = setup(context, true);
  const response = await login();
  assert.equal(response.cookies[0]!.name, "__Host-skypulse");
  assert.equal(response.cookies[0]!.secure, true);
  assert.equal(response.cookies[0]!.domain, undefined);
});

test("missing, malformed, forged, and expired sessions are rejected server-side", async (context) => {
  const { app, sessions, login } = setup(context);
  for (const cookie of ["", "skypulse=bad", `skypulse=${"a".repeat(64)}`]) {
    assert.equal(
      (await app.inject({ url: "/api/workspace", headers: { cookie } }))
        .statusCode,
      401,
    );
  }
  const response = await login();
  const cookie = response.cookies[0]!;
  sessions.get(tokenDigest(cookie.value))!.expiresAt = new Date(
    Date.now() - 1000,
  ).toISOString();
  const expired = await app.inject({
    url: "/api/auth/session",
    headers: { cookie: `${cookie.name}=${cookie.value}` },
  });
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.cookies[0]!.maxAge, 0);
});

test("invalid passwords and unknown accounts have identical responses", async (context) => {
  const { login } = setup(context);
  const wrong = await login(user.email, "wrong");
  const unknown = await login("nobody@example.test");
  assert.equal(wrong.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.deepEqual(wrong.json(), unknown.json());
  assert.equal(wrong.cookies.length, 0);
});

test("logout revokes tokens and repeated logout remains safe", async (context) => {
  const { app, login, sessions } = setup(context);
  const response = await login();
  const cookie = `skypulse=${response.cookies[0]!.value}`;
  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { ...headers, cookie },
    payload: {},
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(logout.cookies[0]!.maxAge, 0);
  assert.equal(sessions.size, 0);
  assert.equal(
    (await app.inject({ url: "/api/workspace", headers: { cookie } }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers,
        payload: {},
      })
    ).statusCode,
    204,
  );
});

test("successful reauthentication rotates the current token", async (context) => {
  const { app, login } = setup(context);
  const first = await login();
  const cookie = `skypulse=${first.cookies[0]!.value}`;
  const second = await login(user.email, password, cookie);
  assert.notEqual(first.cookies[0]!.value, second.cookies[0]!.value);
  assert.equal(
    (await app.inject({ url: "/api/workspace", headers: { cookie } }))
      .statusCode,
    401,
  );
});

test("cross-origin and missing-CSRF-header writes are rejected", async (context) => {
  const { app } = setup(context);
  for (const unsafe of [
    {},
    { origin: headers.origin },
    { ...headers, origin: "https://attacker.example" },
  ]) {
    for (const url of ["/api/auth/login", "/api/auth/logout"]) {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url,
            headers: unsafe,
            payload: { email: user.email, password },
          })
        ).statusCode,
        403,
      );
    }
  }
});

test("invalid input and repeated attempts are limited before hashing", async (context) => {
  const { app } = setup(context);
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers,
          payload: { email: user.email, password: "" },
        })
      ).statusCode,
      400,
    );
  }
  const limited = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { email: user.email, password },
  });
  assert.equal(limited.statusCode, 429);
  assert.ok(limited.headers["retry-after"]);
});

test("database errors do not expose private details or authenticate the request", async (context) => {
  const { app, store, login } = setup(context);
  store.findUser = async () => {
    throw new Error("secret database connection string");
  };
  const response = await login();
  assert.equal(response.statusCode, 503);
  assert.equal(response.cookies.length, 0);
  assert.ok(!response.body.includes("secret"));
  store.findSession = async () => {
    throw new Error("secret");
  };
  assert.equal(
    (
      await app.inject({
        url: "/api/workspace",
        headers: { cookie: `skypulse=${"a".repeat(64)}` },
      })
    ).statusCode,
    503,
  );
});
