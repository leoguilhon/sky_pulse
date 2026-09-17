import type { StyleSpecification } from "maplibre-gl";

export const WORLD_SOURCE = "skypulse-world";
export const WORLD_LAYER = "skypulse-world-surface";
export const DETAIL_ZOOM = 4;

/** A single local texture stays resident independently of the vector tile cache. */
export function addWorldBasemap(style: StyleSpecification): string[] {
  const surfaces = style.layers.filter((layer) => layer.type !== "symbol");
  const detailSources = [
    ...new Set(
      surfaces.flatMap((layer) =>
        "source" in layer && style.sources[layer.source]?.type === "vector"
          ? [layer.source]
          : [],
      ),
    ),
  ];
  if (!detailSources.length) return [];
  for (const layer of surfaces) {
    if ("source" in layer && detailSources.includes(layer.source)) {
      layer.minzoom = Math.max(layer.minzoom ?? 0, DETAIL_ZOOM);
    }
  }
  style.sources[WORLD_SOURCE] = {
    type: "image",
    url: "/maps/world-base.png",
    coordinates: [
      [-180, 85.05112878],
      [180, 85.05112878],
      [180, -85.05112878],
      [-180, -85.05112878],
    ],
  };
  style.layers = [
    ...surfaces,
    {
      id: WORLD_LAYER,
      type: "raster",
      source: WORLD_SOURCE,
      paint: {
        "raster-opacity": 1,
        "raster-fade-duration": 0,
        "raster-opacity-transition": { duration: 0 },
      },
    },
    ...style.layers.filter((layer) => layer.type === "symbol"),
  ];
  return detailSources;
}
