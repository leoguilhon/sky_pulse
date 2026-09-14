import type { StyleSpecification } from "maplibre-gl";

/** Set every base surface explicitly; upstream defaults include black airports. */
export function applyBasemapPalette(style: StyleSpecification): void {
  const fills: Record<string, string> = {
    water: "#163a49",
    landcover_ice_shelf: "#82969a",
    landcover_glacier: "#82969a",
    landuse_residential: "#3e504e",
    landcover_wood: "#304c43",
    landuse_park: "#38564b",
    building: "#344340",
    "aeroway-area": "#52665f",
  };
  for (const layer of style.layers) {
    if (layer.type === "background") {
      layer.paint = { ...layer.paint, "background-color": "#455953" };
      delete layer.paint["background-pattern"];
    } else if (layer.type === "fill") {
      const color = fills[layer.id] ?? "#455953";
      layer.paint = {
        ...layer.paint,
        "fill-color": color,
        "fill-outline-color": color,
      };
      delete layer.paint["fill-pattern"];
    } else if (layer.type === "line") {
      layer.paint = { ...layer.paint, "line-color": "#71837d" };
      delete layer.paint["line-pattern"];
    } else if (layer.type === "symbol") {
      layer.paint = {
        ...layer.paint,
        "text-color": "#afbfbc",
        "text-halo-color": "#40534f",
      };
    }
  }
}
