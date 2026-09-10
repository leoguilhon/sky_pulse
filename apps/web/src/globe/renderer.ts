import {
  Map,
  AttributionControl,
  setWorkerUrl,
  type FilterSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { HOME, type View } from "./geography";
import "maplibre-gl/dist/maplibre-gl.css";
setWorkerUrl(workerUrl);

export interface GlobeController {
  goTo(view: View): void;
  zoom(change: number): void;
  rotate(latitude: number, longitude: number): void;
  dispose(): void;
}

export async function createGlobe(
  host: HTMLElement,
  signal: AbortSignal,
  onView: (view: View) => void,
  onError: (message: string) => void,
  onDetails: (message: string | null) => void,
  onPlaces: (names: string[]) => void,
  onLoading: (loading: boolean) => void,
): Promise<GlobeController> {
  const response = await fetch("/maps/style.json", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok)
    throw new Error("The Earth map could not be loaded. Please try again.");
  const style = (await response.json()) as StyleSpecification;
  signal.throwIfAborted();
  style.projection = { type: "globe" };
  style.sky = {
    "sky-color": "#060e17",
    "horizon-color": "#3b7794",
    "fog-color": "#172e3b",
    "sky-horizon-blend": 0.15,
    "horizon-fog-blend": 0.1,
    "fog-ground-blend": 0,
    "atmosphere-blend": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      0.45,
      3,
      0.45,
      5,
      0,
    ],
  };
  const labels = style.layers.filter((layer) => layer.type === "symbol");
  const originalFilters = new globalThis.Map(
    labels.map((layer) => [layer.id, layer.filter]),
  );
  function labelFilter(center: View): FilterSpecification {
    // Limit global labels to a 38-degree cap, then follow the visible area
    // at street scale. Geodesic distance also works across the antimeridian.
    const metersPerPixel =
      (40075016.686 * Math.cos((center.latitude * Math.PI) / 180)) /
      (512 * 2 ** center.zoom);
    const radius = Math.min(
      4200000,
      Math.min(host.clientWidth, host.clientHeight) * 0.48 * metersPerPixel,
    );
    return [
      "<",
      [
        "distance",
        { type: "Point", coordinates: [center.longitude, center.latitude] },
      ],
      radius,
    ];
  }
  function focusedFilter(
    id: string,
    focus: FilterSpecification,
  ): FilterSpecification {
    const original = originalFilters.get(id);
    // The bundled style uses expression filters, not legacy property filters.
    return original ? (["all", original, focus] as FilterSpecification) : focus;
  }
  const initialFocus = labelFilter(HOME);
  for (const layer of labels) {
    layer.filter = focusedFilter(layer.id, initialFocus);
    layer.layout = {
      ...layer.layout,
      "text-padding": ["interpolate", ["linear"], ["zoom"], 2, 14, 6, 7, 11, 3],
      "text-allow-overlap": false,
      "icon-allow-overlap": false,
    };
    const minimumZoom: Record<string, number> = {
      place_state: 3,
      place_city_large: 4,
      place_city: 6,
      place_town: 8,
      place_village: 12,
      place_suburb: 11,
      place_other: 12,
    };
    layer.minzoom = Math.max(layer.minzoom ?? 0, minimumZoom[layer.id] ?? 0);
  }
  const landColors: Record<string, string> = {
    water: "#163a49",
    landcover_ice_shelf: "#82969a",
    landcover_glacier: "#82969a",
    landuse_residential: "#3e504e",
    landcover_wood: "#304c43",
    landuse_park: "#38564b",
    building: "#344340",
    road_area_pier: "#455953",
  };
  // Keep the basemap quiet so live aircraft can own the visual hierarchy.
  for (const layer of style.layers) {
    if (layer.type === "background") {
      layer.paint = { ...layer.paint, "background-color": "#455953" };
    }
    if (layer.type === "fill" && landColors[layer.id]) {
      layer.paint = { ...layer.paint, "fill-color": landColors[layer.id]! };
      delete layer.paint["fill-pattern"];
    }
    if (layer.type === "line" && layer.id === "waterway") {
      layer.paint = {
        ...layer.paint,
        "line-color": "#294c55",
        "line-opacity": 0.4,
      };
    }
    if (layer.type === "line" && layer.id.startsWith("boundary_country")) {
      layer.paint = {
        ...layer.paint,
        "line-color": "#8da19b",
        "line-opacity": 0.42,
      };
    }
    if (layer.id === "boundary_state" && layer.type === "line") {
      layer.paint = {
        ...layer.paint,
        "line-color": "#7b8f89",
        "line-opacity": 0.28,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.6,
          8,
          1.4,
          16,
          2,
        ],
      };
    }
    if (layer.type === "line" && layer.id.startsWith("highway_")) {
      const isCasing = layer.id.endsWith("_casing");
      const isInner = layer.id.endsWith("_inner");
      const isPath = layer.id === "highway_path";
      if (isPath || layer.id === "highway_minor") {
        layer.minzoom = Math.max(layer.minzoom ?? 0, isPath ? 14 : 12.5);
      }
      layer.paint = {
        ...layer.paint,
        "line-color": isCasing ? "#344a48" : isInner ? "#82938e" : "#71837d",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          isCasing ? 0.07 : isInner ? 0.14 : isPath ? 0.05 : 0.08,
          15,
          isCasing ? 0.12 : isInner ? 0.22 : isPath ? 0.1 : 0.16,
          18,
          isCasing ? 0.16 : isInner ? 0.28 : isPath ? 0.16 : 0.22,
        ],
      };
    }
    if (layer.type === "line" && layer.id === "road_pier") {
      layer.paint = {
        ...layer.paint,
        "line-color": "#70827c",
        "line-opacity": 0.1,
      };
    }
    if (layer.type === "line" && layer.id.startsWith("railway")) {
      layer.paint = {
        ...layer.paint,
        "line-color": layer.id.endsWith("dashline") ? "#364d4a" : "#758680",
        "line-opacity": layer.id.endsWith("dashline") ? 0.1 : 0.08,
      };
    }
    if (layer.type === "line" && layer.id.startsWith("aeroway-")) {
      layer.paint = {
        ...layer.paint,
        "line-color": layer.id.endsWith("casing") ? "#3a504e" : "#7a8b85",
        "line-opacity": layer.id.endsWith("casing") ? 0.12 : 0.16,
      };
    }
    if (layer.id.startsWith("place_") && layer.type === "symbol") {
      const isCountry = layer.id.startsWith("place_country");
      const isCity =
        layer.id === "place_city_large" || layer.id === "place_city";
      const isLocal = layer.id === "place_suburb" || layer.id === "place_other";
      layer.paint = {
        ...layer.paint,
        "text-color": layer.id === "place_state" ? "#9caeaa" : "#afbfbc",
        "text-opacity": isCountry ? 0.66 : isCity ? 0.56 : 0.42,
        "text-halo-color": "#40534f",
        "text-halo-width": isLocal ? 1 : 0.8,
      };
      layer.layout = {
        ...layer.layout,
        "text-field": [
          "coalesce",
          ["get", "name:en"],
          ["get", "name_en"],
          ["get", "name:latin"],
          ["get", "name"],
        ],
      };
      if (layer.id === "place_state") layer.layout["text-size"] = 12;
    }
    if (layer.type === "symbol" && layer.id.startsWith("highway_name")) {
      layer.minzoom = Math.max(layer.minzoom ?? 0, 12);
      layer.paint = {
        ...layer.paint,
        "text-color": "#b2c0bd",
        "text-opacity": 0.44,
        "text-halo-color": "#354a46",
        "text-halo-width": 1,
      };
    }
    if (layer.type === "symbol" && layer.id === "water_name") {
      layer.paint = {
        ...layer.paint,
        "text-color": "#83a3aa",
        "text-opacity": 0.58,
        "text-halo-color": "#173944",
        "text-halo-width": 1,
      };
    }
    if (layer.type === "symbol" && layer.id.startsWith("road_oneway")) {
      layer.paint = { ...layer.paint, "icon-opacity": 0.3 };
    }
  }
  let map: Map;
  try {
    map = new Map({
      container: host,
      style,
      center: [HOME.longitude, HOME.latitude],
      zoom: HOME.zoom,
      minZoom: 0.5,
      maxZoom: 18,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      keyboard: false,
      attributionControl: false,
      renderWorldCopies: false,
      canvasContextAttributes: { antialias: true },
      maxTileCacheSize: 128,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      transformRequest: (url) => ({ url, credentials: "same-origin" }),
    });
  } catch {
    throw new Error(
      "3D rendering is unavailable. Enable hardware acceleration or try a browser with WebGL 2 support.",
    );
  }
  map.addControl(new AttributionControl({ compact: false }), "bottom-right");
  const canvas = map.getCanvas();
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive 3D Earth");
  canvas.setAttribute("aria-describedby", "globe-instructions");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const view = (): View => ({
    latitude: map.getCenter().lat,
    longitude: map.getCenter().wrap().lng,
    zoom: map.getZoom(),
  });
  let disposed = false;
  let lastReported = 0;
  let lastFocusUpdate = 0;
  let focusKey = "";
  function updateFocus() {
    if (disposed || !map.getLayer(labels[0]!.id)) return;
    const current = view();
    const key = `${current.latitude}/${current.longitude}/${current.zoom}/${host.clientWidth}/${host.clientHeight}`;
    if (key === focusKey) return;
    focusKey = key;
    lastFocusUpdate = performance.now();
    const focus = labelFilter(current);
    for (const layer of labels)
      map.setFilter(layer.id, focusedFilter(layer.id, focus));
  }
  function report() {
    if (!disposed) {
      onView(view());
      lastReported = performance.now();
    }
  }
  function moved() {
    if (performance.now() - lastReported > 100) report();
    if (performance.now() - lastFocusUpdate > 200) updateFocus();
  }
  function goTo(target: View) {
    onLoading(true);
    map.easeTo({
      center: [target.longitude, Math.max(-85, Math.min(85, target.latitude))],
      zoom: Math.max(0.5, Math.min(18, target.zoom)),
      bearing: 0,
      pitch: 0,
      duration: reducedMotion.matches ? 0 : 700,
    });
  }
  function zoom(change: number) {
    goTo({ ...view(), zoom: map.getZoom() + change });
  }
  function rotate(latitude: number, longitude: number) {
    const current = view();
    goTo({
      ...current,
      latitude: current.latitude + latitude,
      longitude: current.longitude + longitude,
    });
  }
  function key(event: KeyboardEvent) {
    const step = 15 / Math.pow(2, Math.max(0, map.getZoom() - 3));
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotate(0, -step),
      ArrowRight: () => rotate(0, step),
      ArrowUp: () => rotate(step, 0),
      ArrowDown: () => rotate(-step, 0),
      "+": () => zoom(1),
      "=": () => zoom(1),
      "-": () => zoom(-1),
      Home: () => goTo(HOME),
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]!();
    }
  }
  function lost(event: Event) {
    event.preventDefault();
    onError("The 3D connection was interrupted. Reload the globe to continue.");
  }
  map.on("error", () => {
    if (!disposed)
      onDetails(
        "Some map details could not be loaded. Check your connection, then reload the map.",
      );
  });
  map.on("load", report);
  map.on("load", updateFocus);
  map.on("moveend", updateFocus);
  map.on("resize", updateFocus);
  map.on("movestart", () => onLoading(true));
  map.on("dataloading", () => onLoading(true));
  map.on("idle", () => {
    if (disposed) return;
    const names = map
      .queryRenderedFeatures()
      .filter((feature) => feature.layer.id.startsWith("place_"))
      .sort((a, b) => {
        const distance = (feature: typeof a) => {
          if (feature.geometry.type !== "Point") return Infinity;
          const point = map.project(
            feature.geometry.coordinates as [number, number],
          );
          return Math.hypot(
            point.x - host.clientWidth / 2,
            point.y - host.clientHeight / 2,
          );
        };
        return distance(a) - distance(b);
      })
      .map(
        (feature) =>
          feature.properties["name:en"] ??
          feature.properties.name_en ??
          feature.properties["name:latin"] ??
          feature.properties.name,
      )
      .filter((name): name is string => typeof name === "string");
    onPlaces([...new Set(names)].slice(0, 100));
    onLoading(false);
  });
  map.on("move", moved);
  map.on("moveend", report);
  canvas.addEventListener("keydown", key);
  canvas.addEventListener("webglcontextlost", lost);
  const observer = new ResizeObserver(() => {
    if (!disposed) map.resize();
  });
  observer.observe(host);
  report();
  onDetails(null);
  return {
    goTo,
    zoom,
    rotate,
    dispose() {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("keydown", key);
      canvas.removeEventListener("webglcontextlost", lost);
      map.remove();
    },
  };
}
