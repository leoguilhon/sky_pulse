import type { StyleSpecification } from "maplibre-gl";

/** Label focus changes must not flush the surface's parent-tile cache. */
export function isolateBasemapLabels(style: StyleSpecification): void {
  const copies = new Map<string, string>();
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const source = style.sources[layer.source];
    if (source?.type !== "vector") continue;
    let id = copies.get(layer.source);
    if (!id) {
      id = `skypulse-labels-${layer.source}`;
      while (style.sources[id]) id += "-labels";
      style.sources[id] = { ...source };
      copies.set(layer.source, id);
    }
    layer.source = id;
  }
}
