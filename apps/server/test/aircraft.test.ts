import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenSkyProvider,
  normalizeOpenSkyState,
} from "../src/aircraft/opensky.js";
import { createAircraftService } from "../src/aircraft/service.js";
import {
  AircraftProviderError,
  SAO_PAULO_REGION,
  type AircraftProvider,
} from "../src/aircraft/types.js";

const state = [
  "e490a1",
  " GLO123 ",
  "Brazil",
  1_700_000_001,
  1_700_000_002,
  -46.63,
  -23.55,
  10_200,
  false,
  230.5,
  91.2,
  -0.3,
  null,
  10_500,
];

test("OpenSky state vectors normalize without leaking provider arrays", () => {
  assert.deepEqual(normalizeOpenSkyState(state, 1_700_000_000), {
    id: "e490a1",
    callsign: "GLO123",
    category: null,
    latitude: -23.55,
    longitude: -46.63,
    altitudeMeters: 10_200,
    speedMetersPerSecond: 230.5,
    headingDegrees: 91.2,
    verticalRateMetersPerSecond: -0.3,
    onGround: false,
    originCountry: "Brazil",
    positionUpdatedAt: "2023-11-14T22:13:21.000Z",
    lastUpdated: "2023-11-14T22:13:22.000Z",
  });
  assert.equal(normalizeOpenSkyState(null, 1_700_000_000), null);
  assert.equal(
    normalizeOpenSkyState([...state.slice(0, 5), null, null], 1_700_000_000),
    null,
  );
  assert.equal(
    normalizeOpenSkyState([...state.slice(0, 5), 181, 91], 1_700_000_000),
    null,
  );
});

test("OpenSky requests the configured region and drops positions that are missing", async () => {
  let requested: URL | null = null;
  const request = (async (input: string | URL | Request) => {
    requested = new URL(input instanceof Request ? input.url : input);
    return new Response(
      JSON.stringify({ time: 1_700_000_000, states: [state, ["bad001"]] }),
      { status: 200, headers: { "X-Rate-Limit-Remaining": "399" } },
    );
  }) as typeof fetch;
  const provider = new OpenSkyProvider({ fetch: request });
  const result = await provider.fetchAircraft(SAO_PAULO_REGION.bounds);
  assert.equal(result.aircraft.length, 1);
  assert.equal(result.remainingCredits, 399);
  assert.equal(requested!.pathname, "/api/states/all");
  assert.equal(requested!.searchParams.get("extended"), "1");
  assert.equal(requested!.searchParams.get("lamin"), "-25.5");
  assert.equal(requested!.searchParams.get("lamax"), "-20.5");
  assert.equal(requested!.searchParams.get("lomin"), "-49.5");
  assert.equal(requested!.searchParams.get("lomax"), "-44.5");
});

test("OpenSky OAuth tokens are cached and provider rate limits are explicit", async () => {
  let tokenRequests = 0;
  let stateRequests = 0;
  const request = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "auth.example.test") {
      tokenRequests += 1;
      return new Response(
        JSON.stringify({ access_token: "token-value", expires_in: 1800 }),
      );
    }
    stateRequests += 1;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer token-value",
    );
    return stateRequests === 1
      ? new Response(JSON.stringify({ time: 1_700_000_000, states: [] }))
      : new Response(null, {
          status: 429,
          headers: { "X-Rate-Limit-Retry-After-Seconds": "75" },
        });
  }) as typeof fetch;
  const provider = new OpenSkyProvider({
    fetch: request,
    clientId: "client-id",
    clientSecret: "client-secret",
    tokenUrl: "https://auth.example.test/token",
  });
  await provider.fetchAircraft(SAO_PAULO_REGION.bounds);
  await assert.rejects(
    provider.fetchAircraft(SAO_PAULO_REGION.bounds),
    (error: unknown) =>
      error instanceof AircraftProviderError &&
      error.code === "RATE_LIMITED" &&
      error.retryAfterSeconds === 75,
  );
  assert.equal(tokenRequests, 1);
});

test("aircraft snapshots are shared from cache and stale data survives an outage", async () => {
  let currentTime = 1_700_000_000_000;
  let calls = 0;
  const provider: AircraftProvider = {
    name: "Test provider",
    async fetchAircraft() {
      calls += 1;
      if (calls > 1)
        throw new AircraftProviderError("UNAVAILABLE", "Provider unavailable.");
      return {
        aircraft: [normalizeOpenSkyState(state, currentTime / 1000)!],
        observedAt: new Date(currentTime).toISOString(),
        remainingCredits: 10,
      };
    },
  };
  const service = createAircraftService(provider, SAO_PAULO_REGION.bounds, {
    cacheTtlMs: 100,
    staleTtlMs: 1000,
    now: () => currentTime,
  });
  const fresh = await service.getAircraft();
  assert.equal(fresh.cached, false);
  assert.equal(fresh.stale, false);
  assert.equal((await service.getAircraft()).cached, true);
  assert.equal(calls, 1);
  currentTime += 200;
  const fallback = await service.getAircraft();
  assert.equal(fallback.cached, true);
  assert.equal(fallback.stale, true);
  assert.equal(calls, 2);
});

test("provider retry windows suppress repeated external requests", async () => {
  let currentTime = 1_700_000_000_000;
  let calls = 0;
  const provider: AircraftProvider = {
    name: "Limited provider",
    async fetchAircraft() {
      calls += 1;
      throw new AircraftProviderError("RATE_LIMITED", "Rate limited.", 60);
    },
  };
  const service = createAircraftService(provider, SAO_PAULO_REGION.bounds, {
    now: () => currentTime,
  });
  await assert.rejects(service.getAircraft(), AircraftProviderError);
  currentTime += 1000;
  await assert.rejects(
    service.getAircraft(),
    (error: unknown) =>
      error instanceof AircraftProviderError && error.retryAfterSeconds === 59,
  );
  assert.equal(calls, 1);
});

test("extended categories preserve type information without guessing missing metadata", () => {
  for (const [code, expected] of [
    [2, "light"],
    [4, "large"],
    [6, "heavy"],
    [8, "rotorcraft"],
    [9, "glider"],
    [14, "uav"],
    [0, null],
    [1, null],
    [13, null],
    [99, null],
    [2.5, null],
  ] as const) {
    const extended: unknown[] = [...state];
    extended[17] = code;
    assert.equal(
      normalizeOpenSkyState(extended, 1_700_000_000)?.category,
      expected,
    );
  }
  for (const code of [16, 17, 18, 19, 20]) {
    const extended: unknown[] = [...state];
    extended[17] = code;
    assert.equal(normalizeOpenSkyState(extended, 1_700_000_000), null);
  }
});
