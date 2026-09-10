import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAircraftCatalog,
  parseAircraftTypes,
} from "../src/aircraft/catalog.js";
import { createFlightRouteLookup } from "../src/aircraft/flight-routes.js";
import { aircraftSymbol } from "../../web/src/globe/aircraft-symbols.ts";

test("aircraft catalog parses escaped fields, rejects bad identifiers and keeps missing values null", () => {
  const aircraft = parseAircraftCatalog(
    "E49001;PR-ABC;C210;00;Cessna 210;;Owner\\; Company;\ninvalid;bad;;;;;;\ne49002;;;;;;;\n",
  );
  assert.equal(aircraft.length, 2);
  assert.equal(aircraft[0]!.icao24, "e49001");
  assert.equal(aircraft[0]!.operator, "Owner; Company");
  assert.equal(aircraft[1]!.type_code, null);
  assert.deepEqual(
    parseAircraftTypes({
      C210: ["Cessna 210", "L1P", "L"],
      BAD: [],
      GLID: ["Glider", "L0-", "L"],
    }),
    [
      {
        type_code: "C210",
        model: "Cessna 210",
        description: "L1P",
        wake_category: "L",
      },
      {
        type_code: "GLID",
        model: "Glider",
        description: "L0-",
        wake_category: "L",
      },
    ],
  );
});

test("catalog engine descriptors classify types beyond the original hardcoded list", () => {
  const base = {
    id: "e49001",
    callsign: null,
    category: null,
    latitude: 0,
    longitude: 0,
    altitudeMeters: null,
    speedMetersPerSecond: null,
    headingDegrees: null,
    verticalRateMetersPerSecond: null,
    onGround: false,
    originCountry: null,
    lastUpdated: "2026-09-10T12:00:00Z",
  };
  for (const [typeCode, typeDescription, wakeCategory, expected] of [
    ["C210", "L1P", "L", "single"],
    ["PA42", "L2T", "L", "twin"],
    ["F900", "L3J", "M", "jet"],
    ["A124", "L4J", "H", "heavy"],
    ["S61", "H2T", "M", "helicopter"],
    ["GLID", "L0-", "L", "glider"],
  ])
    assert.equal(
      aircraftSymbol({ ...base, typeCode, typeDescription, wakeCategory }),
      expected,
    );
  assert.equal(
    aircraftSymbol({ ...base, speedMetersPerSecond: 250 }),
    "unknown",
  );
});

const airport = (icao: string) => ({
  icao_code: icao,
  iata_code: null,
  name: `Airport ${icao}`,
  municipality: "City",
  country_name: "Brazil",
});
const response = () =>
  new Response(
    JSON.stringify({
      response: {
        flightroute: {
          callsign: "GLO1001",
          callsign_iata: "G31001",
          origin: airport("SBRJ"),
          destination: airport("SBSP"),
          midpoint: airport("SBGL"),
          airline: { name: "GOL" },
        },
      },
    }),
  );

test("route lookup normalizes callsigns, shares concurrent requests and expires cached routes", async () => {
  let calls = 0;
  let now = 1000000;
  const lookup = createFlightRouteLookup({
    now: () => now,
    fetch: (async (url) => {
      calls++;
      assert.ok(String(url).endsWith("/callsign/GLO1001"));
      return response();
    }) as typeof fetch,
  });
  const [first, second] = await Promise.all([
    lookup(" glo1001 "),
    lookup("GLO1001"),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first.origin?.icao, "SBRJ");
  assert.equal(first.destination?.icao, "SBSP");
  assert.equal(first.via[0]?.icao, "SBGL");
  assert.equal((await lookup(null)).status, "no-callsign");
  assert.equal((await lookup("../etc")).status, "no-callsign");
  await lookup("GLO1001");
  assert.equal(calls, 1);
  now += 6 * 3600000 + 1;
  await lookup("GLO1001");
  assert.equal(calls, 2);
});

test("route 404, malformed responses, transport failures and global rate limits remain distinct", async () => {
  const missing = createFlightRouteLookup({
    fetch: (async () => new Response(null, { status: 404 })) as typeof fetch,
  });
  assert.equal((await missing("GLO1001")).status, "not-found");
  const malformed = createFlightRouteLookup({
    fetch: (async () =>
      new Response(
        JSON.stringify({ response: { flightroute: { callsign: "OTHER" } } }),
      )) as typeof fetch,
  });
  assert.equal((await malformed("GLO1001")).status, "unavailable");
  let requests = 0;
  const limited = createFlightRouteLookup({
    fetch: (async () => {
      requests++;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }) as typeof fetch,
  });
  assert.equal((await limited("GLO1001")).status, "unavailable");
  assert.equal((await limited("GLO1002")).status, "unavailable");
  assert.equal(requests, 1);
  const offline = createFlightRouteLookup({
    fetch: (async () => {
      throw new Error("Offline");
    }) as typeof fetch,
  });
  assert.equal((await offline("GLO1001")).status, "unavailable");
});
