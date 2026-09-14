import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { searchAircraft } from "../../apps/server/src/aircraft/geography";
import { createAircraftService } from "../../apps/server/src/aircraft/service";
import { registerAircraftRoutes } from "../../apps/server/src/aircraft/routes";
import {
  WORLD_REGION,
  type AircraftPosition,
} from "../../apps/server/src/aircraft/types";
import { routeGeometry } from "../../apps/web/src/globe/route-geometry";
import type { Airport, Route } from "../../apps/web/src/globe/route-types";

const timestamp = new Date().toISOString();
const aircraft = (id: string, callsign: string | null): AircraftPosition => ({
  id,
  callsign,
  category: null,
  latitude: 48,
  longitude: 15,
  altitudeMeters: 10000,
  speedMetersPerSecond: 200,
  headingDegrees: 0,
  verticalRateMetersPerSecond: 0,
  onGround: false,
  originCountry: null,
  lastUpdated: timestamp,
  positionUpdatedAt: timestamp,
});
test("search ranks exact matches, normalizes case, excludes expired observations and bounds results", () => {
  const positions = Array.from({ length: 30 }, (_, i) =>
    aircraft(i.toString(16).padStart(6, "0"), `TEST${i}`),
  );
  positions.push(aircraft("abcdef", "TEST"), {
    ...aircraft("expired", "TEST"),
    lastUpdated: "2000-01-01T00:00:00Z",
  });
  const matches = searchAircraft(positions, "test");
  assert.equal(matches.length, 20);
  assert.equal(matches[0]!.id, "abcdef");
  assert.ok(!matches.some((p) => p.id === "expired"));
  assert.equal(searchAircraft(positions, "ABCDEF")[0]!.callsign, "TEST");
  assert.equal(searchAircraft(positions, "NONE").length, 0);
});
test("search validates HTTP input and shares the provider snapshot with viewport requests", async (t) => {
  let calls = 0;
  const service = createAircraftService(
    {
      name: "test",
      async fetchAircraft() {
        calls++;
        return {
          aircraft: [aircraft("abcdef", "TEST")],
          observedAt: timestamp,
          remainingCredits: null,
        };
      },
    },
    WORLD_REGION.bounds,
  );
  const app = Fastify();
  t.after(() => app.close());
  await registerAircraftRoutes(app, service, async () => {});
  for (const query of [
    "search=A",
    "search=TOOLONG99",
    "search=%20%20",
    "search=TEST&minimumLatitude=0&maximumLatitude=10&minimumLongitude=0&maximumLongitude=10",
  ])
    assert.equal((await app.inject(`/api/aircraft?${query}`)).statusCode, 400);
  assert.equal(calls, 0);
  const response = await app.inject("/api/aircraft?search=test");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().aircraft[0].id, "abcdef");
  assert.equal(
    (
      await service.getAircraft({
        minimumLatitude: -10,
        maximumLatitude: 10,
        minimumLongitude: -10,
        maximumLongitude: 10,
      })
    ).aircraft.length,
    0,
  );
  assert.equal(calls, 1);
});
const airport = (longitude: number | null, latitude = 0): Airport => ({
  icao: "TEST",
  iata: null,
  name: "Airport",
  city: null,
  country: null,
  longitude,
  latitude,
});
const route = (
  origin: Airport,
  destination: Airport,
  via: Airport[] = [],
): Route => ({
  status: "available",
  callsign: "TEST",
  source: "test",
  fetchedAt: timestamp,
  origin,
  destination,
  via,
  airline: null,
  flightNumber: null,
});
test("route legs cross the date line without a world-spanning chord", () => {
  const features = routeGeometry(
    route(airport(170, 30), airport(-170, 30)),
  ).features;
  const lines = features.filter((f) => f.geometry.type === "LineString");
  assert.equal(lines.length, 2);
  for (const feature of lines) {
    if (feature.geometry.type !== "LineString") continue;
    feature.geometry.coordinates.forEach((point, i, coordinates) => {
      assert.ok(point.every(Number.isFinite));
      if (i) assert.ok(Math.abs(point[0]! - coordinates[i - 1]![0]!) <= 180);
    });
  }
  assert.ok(
    lines.some(
      (f) =>
        f.geometry.type === "LineString" &&
        f.geometry.coordinates.some((p) => p[1]! > 30),
    ),
  );
});
test("short equatorial and meridional routes bow visibly while keeping endpoints", () => {
  for (const [origin, destination] of [
    [airport(0), airport(2)],
    [airport(0), airport(0, 2)],
    [airport(-0.006, 43.1787), airport(2.55, 49.0097)],
  ] as const) {
    const line = routeGeometry(route(origin, destination)).features.find(
      (feature) => feature.geometry.type === "LineString",
    );
    assert.ok(line?.geometry.type === "LineString");
    const points = line.geometry.coordinates;
    const start = points[0]!;
    const end = points.at(-1)!;
    const middle = points[64]!;
    assert.ok(Math.abs(start[0]! - origin.longitude!) < 1e-9);
    assert.ok(Math.abs(start[1]! - origin.latitude!) < 1e-9);
    assert.ok(Math.abs(end[0]! - destination.longitude!) < 1e-9);
    assert.ok(Math.abs(end[1]! - destination.latitude!) < 1e-9);
    const dx = end[0]! - start[0]!;
    const dy = end[1]! - start[1]!;
    const deviation =
      Math.abs(dx * (middle[1]! - start[1]!) - dy * (middle[0]! - start[0]!)) /
      Math.hypot(dx, dy);
    assert.ok(deviation > Math.hypot(dx, dy) * 0.1);
  }
});
test("routes preserve stops, omit unknown legs and handle coincident, polar and antipodal endpoints", () => {
  assert.equal(routeGeometry(null).features.length, 0);
  assert.equal(
    routeGeometry(
      route(airport(0), airport(20), [airport(null)]),
    ).features.filter((f) => f.geometry.type === "LineString").length,
    0,
  );
  assert.equal(
    routeGeometry(
      route(airport(0), airport(20), [airport(10)]),
    ).features.filter((f) => f.geometry.type === "LineString").length,
    2,
  );
  for (const destination of [airport(0), airport(180)])
    assert.equal(
      routeGeometry(route(airport(0), destination)).features.filter(
        (f) => f.geometry.type === "LineString",
      ).length,
      0,
    );
  assert.ok(
    !JSON.stringify(
      routeGeometry(route(airport(0, 90), airport(30, 70))),
    ).includes("NaN"),
  );
});
