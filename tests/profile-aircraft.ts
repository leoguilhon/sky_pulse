import { performance } from "node:perf_hooks";
import { filterAircraft } from "../apps/server/src/aircraft/geography";
import { AircraftMotion } from "../apps/web/src/globe/aircraft-motion";
import { aircraftGeoJson } from "../apps/web/src/globe/aircraft-geojson";
import type { AircraftPosition } from "../apps/web/src/aircraft";

const now = Date.now();
const timestamp = new Date(now).toISOString();
for (const count of [1000, 20000]) {
  const aircraft: AircraftPosition[] = Array.from(
    { length: count },
    (_, i) => ({
      id: i.toString(16).padStart(6, "0"),
      callsign: `TEST${i}`,
      category: "light",
      latitude: -80 + (i % 160),
      longitude: -180 + ((i * 7) % 360),
      altitudeMeters: 10000,
      speedMetersPerSecond: 200,
      headingDegrees: 90,
      verticalRateMetersPerSecond: 0,
      onGround: false,
      originCountry: null,
      positionUpdatedAt: timestamp,
      lastUpdated: timestamp,
    }),
  );
  const bounds = {
    minimumLatitude: -25,
    maximumLatitude: -20,
    minimumLongitude: -50,
    maximumLongitude: -40,
  };
  const start = performance.now();
  let regional = aircraft;
  for (let i = 0; i < 100; i++) regional = filterAircraft(aircraft, bounds);
  const filterMs = (performance.now() - start) / 100;
  const motion = new AircraftMotion();
  motion.update(aircraft, now);
  motion.update(
    aircraft.map((p) => ({
      ...p,
      longitude: p.longitude + 0.1,
      lastUpdated: new Date(now + 1000).toISOString(),
      positionUpdatedAt: new Date(now + 1000).toISOString(),
    })),
    now + 1000,
  );
  const samples = [];
  for (let i = 0; i < 120; i++) {
    const frame = performance.now();
    aircraftGeoJson(motion.sample(now + 2000 + i * 33));
    samples.push(performance.now() - frame);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      count,
      regionalCount: regional.length,
      filterMeanMs: +filterMs.toFixed(3),
      frameP95Ms: +samples[Math.floor(samples.length * 0.95)]!.toFixed(3),
      snapshotBytes: Buffer.byteLength(JSON.stringify(aircraft)),
      regionalBytes: Buffer.byteLength(JSON.stringify(regional)),
    }),
  );
}
