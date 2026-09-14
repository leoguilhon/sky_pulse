import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { viewportQuery } from "../../apps/web/src/globe/viewport";
import { createAircraftService } from "../../apps/server/src/aircraft/service";
import { registerAircraftRoutes } from "../../apps/server/src/aircraft/routes";
import {
  WORLD_REGION,
  type AircraftPosition,
} from "../../apps/server/src/aircraft/types";

test("viewport bounds preserve date-line crossings, full world and poles", () => {
  const crossing = new URLSearchParams(viewportQuery(170, -10, 190, 10));
  assert.equal(crossing.get("minimumLongitude"), "168");
  assert.equal(crossing.get("maximumLongitude"), "-168");
  const world = new URLSearchParams(viewportQuery(-180, -90, 180, 90));
  assert.equal(world.get("minimumLongitude"), "-180");
  assert.equal(world.get("maximumLongitude"), "180");
  assert.equal(world.get("minimumLatitude"), "-90");
  assert.equal(world.get("maximumLatitude"), "90");
});

test("different viewports share one provider fetch and never mutate its snapshot", async () => {
  let calls = 0;
  const aircraft = [-179, 179, 0].map((longitude, i) => ({
    id: String(i),
    longitude,
    latitude: 0,
  })) as AircraftPosition[];
  const service = createAircraftService(
    {
      name: "test",
      async fetchAircraft(bounds) {
        calls++;
        assert.deepEqual(bounds, WORLD_REGION.bounds);
        return {
          aircraft,
          observedAt: new Date().toISOString(),
          remainingCredits: null,
        };
      },
    },
    WORLD_REGION.bounds,
  );
  const crossing = {
    minimumLatitude: -10,
    maximumLatitude: 10,
    minimumLongitude: 170,
    maximumLongitude: -170,
  };
  const [wrapped, local] = await Promise.all([
    service.getAircraft(crossing),
    service.getAircraft({
      ...crossing,
      minimumLongitude: -10,
      maximumLongitude: 10,
    }),
  ]);
  assert.deepEqual(
    wrapped.aircraft.map((p) => p.longitude),
    [-179, 179],
  );
  assert.deepEqual(
    local.aircraft.map((p) => p.longitude),
    [0],
  );
  assert.equal((await service.getAircraft()).aircraft.length, 3);
  assert.equal(
    (await service.getAircraft({ ...crossing, minimumLatitude: 1 })).aircraft
      .length,
    0,
  );
  assert.equal(calls, 1);
});

test("HTTP bounds validate before fetching and reach the service as numbers", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  let calls = 0;
  await registerAircraftRoutes(
    app,
    {
      async getAircraft(bounds) {
        calls++;
        assert.deepEqual(
          { ...bounds },
          {
            minimumLatitude: -10,
            maximumLatitude: 10,
            minimumLongitude: 170,
            maximumLongitude: -170,
          },
        );
        return {
          aircraft: [],
          observedAt: "",
          fetchedAt: "",
          provider: "test",
          cached: true,
          stale: false,
        };
      },
    },
    async () => {},
  );
  for (const query of [
    "minimumLatitude=0",
    "minimumLatitude=x&maximumLatitude=10&minimumLongitude=0&maximumLongitude=10",
    "minimumLatitude=11&maximumLatitude=10&minimumLongitude=0&maximumLongitude=10",
    "minimumLatitude=-91&maximumLatitude=10&minimumLongitude=0&maximumLongitude=10",
  ]) {
    assert.equal((await app.inject(`/api/aircraft?${query}`)).statusCode, 400);
  }
  assert.equal(calls, 0);
  const result = await app.inject(
    "/api/aircraft?minimumLatitude=-10&maximumLatitude=10&minimumLongitude=170&maximumLongitude=-170",
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(calls, 1);
});
