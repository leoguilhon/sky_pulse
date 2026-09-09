import { useEffect, useRef, useState } from "react";
import { createGlobe, type GlobeController } from "./renderer";
import { HOME, type View } from "./geography";
import "./globe.css";

const regions = [
  { name: "Brazil", latitude: -15, longitude: -52, zoom: 4 },
  { name: "Europe", latitude: 48, longitude: 15, zoom: 3 },
  { name: "Asia", latitude: 30, longitude: 105, zoom: 2.5 },
  { name: "São Paulo", latitude: -23.5505, longitude: -46.6333, zoom: 11 },
];
export default function Globe() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<GlobeController | null>(null);
  const [view, setView] = useState<View>(HOME);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [places, setPlaces] = useState<string[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState("loading");
    setDetailsLoading(true);
    const fail = (message: string) => {
      if (!abort.signal.aborted) {
        setError(message);
        setState("error");
      }
    };
    void createGlobe(
      host.current!,
      abort.signal,
      setView,
      fail,
      setDetailsError,
      setPlaces,
      setDetailsLoading,
    )
      .then((instance) => {
        if (abort.signal.aborted) {
          instance.dispose();
          return;
        }
        controller.current = instance;
        setState("ready");
      })
      .catch((failure: unknown) =>
        fail(
          failure instanceof Error
            ? failure.message
            : "Unable to load the globe.",
        ),
      );
    return () => {
      abort.abort();
      controller.current?.dispose();
      controller.current = null;
    };
  }, [attempt]);
  const coordinate = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`;
  return (
    <section className="earth-workspace" aria-labelledby="earth-heading">
      <div className="globe-canvas" ref={host} />
      <p className="sr-only" aria-label="Visible place names">
        {places.join(", ")}
      </p>
      <div className="earth-title">
        <div className="eyebrow">
          <span /> EARTH EXPLORER
        </div>
        <h1 id="earth-heading">A world to explore.</h1>
        <p>Zoom in to explore states, cities, and streets.</p>
      </div>
      <nav className="region-nav" aria-label="Geographic navigation">
        {regions.map((region) => (
          <button
            key={region.name}
            disabled={state !== "ready"}
            onClick={() => controller.current?.goTo(region)}
          >
            {region.name}
          </button>
        ))}
      </nav>
      {state === "ready" && !detailsError && (
        <p className="map-loading" role="status" aria-label="Map detail status">
          {detailsLoading ? "Loading map details…" : "Map details ready"}
        </p>
      )}
      {state === "loading" && (
        <div className="globe-message" role="status">
          Preparing your view of Earth…
        </div>
      )}
      {state === "error" && (
        <div className="globe-message">
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt(attempt + 1)}>Reload globe</button>
        </div>
      )}
      {detailsError && state === "ready" && (
        <div className="map-notice">
          <p role="alert">{detailsError}</p>
          <button onClick={() => setAttempt(attempt + 1)}>Reload map</button>
        </div>
      )}
      <div className="globe-tools" role="group" aria-label="Globe controls">
        <button
          aria-label="Zoom in"
          title="Zoom in"
          disabled={state !== "ready"}
          onClick={() => controller.current?.zoom(1)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          title="Zoom out"
          disabled={state !== "ready"}
          onClick={() => controller.current?.zoom(-1)}
        >
          −
        </button>
        <button
          aria-label="Reset globe view"
          title="Reset view"
          disabled={state !== "ready"}
          onClick={() => controller.current?.goTo(HOME)}
        >
          ⌂
        </button>
      </div>
      <div className="globe-bottom">
        <div>
          <span className="hud-label">CAMERA CENTER</span>
          <output aria-label="Camera coordinates">
            {coordinate(view.latitude, "N", "S")} <span>/</span>{" "}
            {coordinate(view.longitude, "E", "W")}
          </output>
        </div>
        <div>
          <span className="hud-label">MAP ZOOM</span>
          <output aria-label="Map zoom">{view.zoom.toFixed(1)} / 18</output>
        </div>
        <span className="exploration-badge">
          EXPLORATION MODE · NO LIVE FLIGHTS
        </span>
      </div>
      <p id="globe-instructions" className="globe-help">
        Drag to rotate · Scroll or pinch to zoom · Focus globe: arrow keys to
        rotate, +/− to zoom, Home to reset
      </p>
    </section>
  );
}
