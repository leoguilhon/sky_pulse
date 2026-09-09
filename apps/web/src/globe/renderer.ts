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
      place_village: 10,
      place_suburb: 11,
      place_other: 12,
    };
    layer.minzoom = Math.max(layer.minzoom ?? 0, minimumZoom[layer.id] ?? 0);
  }
  // Improve contrast for administrative boundaries and geographic labels.
  for (const layer of style.layers) {
    if (layer.id === "boundary_state" && layer.type === "line") {
      layer.paint = {
        ...layer.paint,
        "line-color": "#849caa",
        "line-opacity": 0.85,
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
    if (layer.id.startsWith("place_") && layer.type === "symbol") {
      layer.paint = {
        ...layer.paint,
        "text-color": layer.id === "place_state" ? "#b3d8ce" : "#e0e9ef",
        "text-halo-color": "#121a22",
        "text-halo-width": 1.5,
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
