import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AircraftMotion,
  freshAircraft,
  POSITION_TTL_MS,
  TRANSITION_MS,
} from "../../apps/web/src/globe/aircraft-motion";
import type { AircraftPosition } from "../../apps/web/src/aircraft";

const now = Date.parse("2026-09-10T12:00:00Z");
function position(overrides: Partial<AircraftPosition> = {}): AircraftPosition {
  return {
    id: "abc001",
    callsign: null,
    category: null,
    latitude: 0,
    longitude: 179,
    altitudeMeters: null,
    speedMetersPerSecond: null,
    headingDegrees: 350,
    verticalRateMetersPerSecond: null,
    onGround: false,
    originCountry: null,
    lastUpdated: new Date(now).toISOString(),
    ...overrides,
  };
}
const updated = (overrides: Partial<AircraftPosition> = {}) =>
  position({
    latitude: 10,
    longitude: -179,
    headingDegrees: 10,
    lastUpdated: new Date(now + 1000).toISOString(),
    ...overrides,
  });

test("positions and headings take the shortest path and stop at the observation", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([updated()], now + 1000);
  const middle = motion.sample(now + 1000 + TRANSITION_MS / 2)[0]!;
  assert.equal(middle.latitude, 5);
  assert.equal(middle.longitude, -180);
  assert.equal(middle.headingDegrees, 0);
  assert.equal(middle.lastUpdated, updated().lastUpdated);
  assert.deepEqual(motion.sample(now + 61000), [updated()]);
  assert.equal(motion.isMoving(now + 61000), false);
});

test("cached and older observations do not restart or rewind a transition", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([updated()], now + 1000);
  motion.update([updated({ model: "New metadata" })], now + 11000);
  assert.equal(motion.sample(now + 16000)[0]!.latitude, 5);
  assert.equal(motion.sample(now + 16000)[0]!.model, "New metadata");
  motion.update([position()], now + 21000);
  assert.equal(motion.sample(now + 31000)[0]!.latitude, 10);
});

test("an interrupted transition starts at its displayed position", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([updated()], now + 1000);
  const before = motion.sample(now + 16000)[0]!;
  motion.update(
    [
      updated({
        latitude: 20,
        lastUpdated: new Date(now + 16000).toISOString(),
      }),
    ],
    now + 16000,
  );
  assert.equal(motion.sample(now + 16000)[0]!.latitude, before.latitude);
  assert.equal(motion.sample(now + 31000)[0]!.latitude, 12.5);
});

test("expiry is based on observation time, even with repeated cached responses", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([position()], now + POSITION_TTL_MS - 1);
  assert.equal(motion.sample(now + POSITION_TTL_MS - 1).length, 1);
  assert.deepEqual(motion.sample(now + POSITION_TTL_MS), []);
  assert.deepEqual(
    freshAircraft(
      [
        position({ lastUpdated: "invalid" }),
        position({ lastUpdated: new Date(now + 120000).toISOString() }),
      ],
      now,
    ),
    [],
  );
});

test("missing aircraft disappear and returning aircraft start at their observation", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([], now + 1000);
  assert.deepEqual(motion.sample(now + 1000), []);
  motion.update([updated()], now + 2000);
  assert.deepEqual(motion.sample(now + 2000), [updated()]);
});

test("reduced motion snaps to observations and unknown headings stay unknown", () => {
  const motion = new AircraftMotion();
  motion.update([position()], now);
  motion.update([updated()], now + 1000, true);
  assert.deepEqual(motion.sample(now + 1000), [updated()]);
  motion.update(
    [
      updated({
        headingDegrees: null,
        lastUpdated: new Date(now + 2000).toISOString(),
      }),
    ],
    now + 2000,
  );
  assert.equal(motion.sample(now + 3000)[0]!.headingDegrees, null);
});
