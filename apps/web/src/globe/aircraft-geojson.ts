import type { AircraftPosition } from "../aircraft";
import { aircraftSymbol } from "./aircraft-symbols";

export function aircraftGeoJson(
  aircraft: AircraftPosition[],
  selectedId: string | null = null,
) {
  return {
    type: "FeatureCollection" as const,
    features: aircraft.map((position) => ({
      type: "Feature" as const,
      id: position.id,
      geometry: {
        type: "Point" as const,
        coordinates: [position.longitude, position.latitude],
      },
      properties: {
        id: position.id,
        callsign: position.callsign,
        heading: position.headingDegrees,
        onGround: position.onGround,
        selected: position.id === selectedId,
        icon: `aircraft-${aircraftSymbol(position)}-${position.id === selectedId ? "selected" : position.onGround ? "ground" : "airborne"}`,
      },
    })),
  };
}
