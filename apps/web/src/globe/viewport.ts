/** Normalize wrapped map bounds and pad by 10% for navigation at the edges. */
export function viewportQuery(
  west: number,
  south: number,
  east: number,
  north: number,
): string {
  const span = east - west;
  const padding = Math.max(0, span) * 0.1;
  const latitudePadding = (north - south) * 0.1;
  const wrap = (longitude: number) =>
    ((((longitude + 180) % 360) + 360) % 360) - 180;
  const worldwide = span + padding * 2 >= 360;
  return new URLSearchParams({
    minimumLatitude: String(Math.max(-90, south - latitudePadding)),
    maximumLatitude: String(Math.min(90, north + latitudePadding)),
    minimumLongitude: String(worldwide ? -180 : wrap(west - padding)),
    maximumLongitude: String(worldwide ? 180 : wrap(east + padding)),
  }).toString();
}
