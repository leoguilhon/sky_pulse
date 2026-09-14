import type { FeatureCollection, Feature, LineString, Point } from "geojson";
import type { Airport, Route } from "./route-types";

export const located = (airport: Airport): boolean =>
  typeof airport.latitude === "number" &&
  Number.isFinite(airport.latitude) &&
  Math.abs(airport.latitude) <= 90 &&
  typeof airport.longitude === "number" &&
  Number.isFinite(airport.longitude) &&
  Math.abs(airport.longitude) <= 180;

/** Schematic reference arcs, split at the date line to avoid world-spanning chords. */
export function routeGeometry(
  route: Route | null,
): FeatureCollection<LineString | Point> {
  const features: Feature<LineString | Point>[] = [];
  if (route?.status !== "available" || !route.origin || !route.destination)
    return { type: "FeatureCollection", features };
  const airports = [route.origin, ...route.via, route.destination];
  const radians = Math.PI / 180;
  const vector = (airport: Airport) => {
    const lat = airport.latitude! * radians,
      lon = airport.longitude! * radians;
    return [
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    ];
  };
  airports.forEach((airport, index) => {
    if (located(airport))
      features.push({
        type: "Feature",
        properties: {
          code: airport.iata ?? airport.icao,
          name: airport.name,
          role:
            index === 0
              ? "Origin"
              : index === airports.length - 1
                ? "Destination"
                : "Stop",
        },
        geometry: {
          type: "Point",
          coordinates: [airport.longitude!, airport.latitude!],
        },
      });
    const next = airports[index + 1];
    if (!next || !located(airport) || !located(next)) return;
    const a = vector(airport),
      b = vector(next);
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          a.reduce((sum, v, i) => sum + v * b[i]!, 0),
        ),
      ),
    );
    // Antipodal endpoints do not define a unique shortest route.
    if (angle < 1e-8 || Math.PI - angle < 1e-6) return;
    const normal = [
      a[1]! * b[2]! - a[2]! * b[1]!,
      a[2]! * b[0]! - a[0]! * b[2]!,
      a[0]! * b[1]! - a[1]! * b[0]!,
    ];
    const normalLength = Math.hypot(...normal);
    let segment: number[][] = [];
    const emit = () => {
      if (segment.length > 1)
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: segment },
        });
    };
    for (let step = 0; step <= 128; step++) {
      const t = step / 128;
      const v = a.map(
        (value, i) =>
          (Math.sin((1 - t) * angle) * value + Math.sin(t * angle) * b[i]!) /
          Math.sin(angle),
      );
      // A great circle can project as a straight line. Bow the reference leg
      // sideways on the sphere, tapering exactly to the airport endpoints.
      const bend = Math.sin(Math.PI * t) * Math.min(angle * 0.18, 0.3);
      for (let i = 0; i < 3; i++) {
        v[i] =
          v[i]! * Math.cos(bend) + (normal[i]! / normalLength) * Math.sin(bend);
      }
      const point = [
        Math.atan2(v[1]!, v[0]!) / radians,
        Math.atan2(v[2]!, Math.hypot(v[0]!, v[1]!)) / radians,
      ];
      const previous = segment.at(-1);
      if (previous && Math.abs(point[0]! - previous[0]!) > 180) {
        const boundary = previous[0]! > 0 ? 180 : -180;
        const unwrapped = point[0]! + (boundary > 0 ? 360 : -360);
        const fraction = (boundary - previous[0]!) / (unwrapped - previous[0]!);
        const latitude = previous[1]! + (point[1]! - previous[1]!) * fraction;
        segment.push([boundary, latitude]);
        emit();
        segment = [[-boundary, latitude]];
      }
      segment.push(point);
    }
    emit();
  });
  return { type: "FeatureCollection", features };
}
