import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { AircraftPosition, AircraftResponse } from "../aircraft";
import { createGlobe, type GlobeController } from "./renderer";
import { HOME, type View } from "./geography";
import "./globe.css";

const regions = [
  { name: "Brazil", latitude: -15, longitude: -52, zoom: 4 },
  { name: "Europe", latitude: 48, longitude: 15, zoom: 3 },
  { name: "Asia", latitude: 30, longitude: 105, zoom: 2.5 },
  { name: "São Paulo", latitude: -23.5505, longitude: -46.6333, zoom: 11 },
];

type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" | "empty" | "stale"; data: AircraftResponse };

export default function Globe({ expire }: { expire: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<GlobeController | null>(null);
  const aircraft = useRef<AircraftPosition[]>([]);
  const [view, setView] = useState<View>(HOME);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [places, setPlaces] = useState<string[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [feedAttempt, setFeedAttempt] = useState(0);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
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
        instance.setAircraft(aircraft.current);
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
  useEffect(() => {
    const abort = new AbortController();
    setFeed({ status: "loading" });
    api<AircraftResponse>("/api/aircraft", undefined, {
      signal: abort.signal,
      timeoutMs: 12000,
    })
      .then((data) => {
        if (abort.signal.aborted) return;
        aircraft.current = data.aircraft;
        controller.current?.setAircraft(data.aircraft);
        setFeed({
          status: data.stale
            ? "stale"
            : data.aircraft.length === 0
              ? "empty"
              : "ready",
          data,
        });
      })
      .catch((failure: unknown) => {
        if (abort.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) {
          expire();
          return;
        }
        setFeed({
          status: "error",
          message:
            failure instanceof Error
              ? failure.message
              : "Live aircraft are temporarily unavailable.",
        });
      });
    return () => abort.abort();
  }, [expire, feedAttempt]);
  const coordinate = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`;
  const feedLabel = () => {
    if (feed.status === "loading") return "Connecting live aircraft…";
    if (feed.status === "error") return "Live aircraft unavailable";
    const count = feed.data.aircraft.length;
    const aircraftLabel = `${count} aircraft`;
    if (feed.status === "empty")
      return `No aircraft reported · ${feed.data.region.name}`;
    if (feed.status === "stale") return `Stale snapshot · ${aircraftLabel}`;
    return `Live snapshot · ${aircraftLabel}`;
  };
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
        <h1 id="earth-heading">Airspace, alive.</h1>
        <p>Live aircraft over the São Paulo region.</p>
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
      <div
        className={`aircraft-feed aircraft-feed-${feed.status}`}
        role="status"
        aria-live="polite"
      >
        <span /> {feedLabel()}
      </div>
      {feed.status === "error" && (
        <div className="aircraft-notice">
          <p role="alert">{feed.message}</p>
          <button onClick={() => setFeedAttempt(feedAttempt + 1)}>
            Retry live feed
          </button>
        </div>
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
          LIVE AIRCRAFT · REGIONAL COVERAGE
        </span>
      </div>
      {feed.status !== "loading" && feed.status !== "error" && (
        <a
          className="aircraft-credit"
          href="https://opensky-network.org/"
          target="_blank"
          rel="noreferrer"
        >
          Aircraft data · {feed.data.provider}
        </a>
      )}
      <p id="globe-instructions" className="globe-help">
        Drag to rotate · Scroll or pinch to zoom · Focus globe: arrow keys to
        rotate, +/− to zoom, Home to reset
      </p>
    </section>
  );
}
