import type { AircraftPosition, GeographicBounds } from "./types.js";

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
