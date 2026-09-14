import type { AircraftPosition, GeographicBounds } from "./types.js";

/** Search the cached coverage, never one provider request per result. */
export function searchAircraft(
  aircraft: AircraftPosition[],
  query: string,
  now = Date.now(),
) {
  const term = query.trim().toUpperCase();
  return aircraft
    .filter((p) => {
      const age = now - Date.parse(p.lastUpdated);
      return (
        Number.isFinite(age) &&
        age >= -60000 &&
        age < 600000 &&
        (p.id.toUpperCase().includes(term) ||
          p.callsign?.toUpperCase().includes(term))
      );
    })
    .sort((a, b) => {
      const exact = (p: AircraftPosition) =>
        p.id.toUpperCase() === term || p.callsign?.toUpperCase() === term
          ? 0
          : 1;
      return (
        exact(a) - exact(b) ||
        (a.callsign ?? a.id).localeCompare(b.callsign ?? b.id) ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, 20);
}

/** West greater than east denotes a box crossing the antimeridian. */
export function filterAircraft(
  aircraft: AircraftPosition[],
  bounds?: GeographicBounds,
): AircraftPosition[] {
  if (!bounds) return aircraft;
  const {
    minimumLatitude: south,
    maximumLatitude: north,
    minimumLongitude: west,
    maximumLongitude: east,
  } = bounds;
  return aircraft.filter(
    ({ latitude, longitude }) =>
      latitude >= south &&
      latitude <= north &&
      (west <= east
        ? longitude >= west && longitude <= east
        : longitude >= west || longitude <= east),
  );
}
