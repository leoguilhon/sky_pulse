import { useEffect, useState } from "react";
import { api, ApiError } from "../api";

import type { Route, Airport } from "./route-types";
export function FlightRoute({
  id,
  callsign,
  expire,
  onRoute,
  onAirport,
}: {
  id: string;
  callsign: string | null;
  expire: () => void;
  onRoute: (route: Route | null) => void;
  onAirport: (airport: Airport) => void;
}) {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(Boolean(callsign));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    onRoute(null);
    setRoute(null);
    setLoading(Boolean(callsign));
    setFailed(false);
    if (!callsign) return;
    const abort = new AbortController();
    void api<Route>(`/api/aircraft/${id}/route`, undefined, {
      signal: abort.signal,
      timeoutMs: 10000,
    })
      .then((data) => {
        if (!abort.signal.aborted) {
          setRoute(data);
          onRoute(data);
        }
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
      onRoute(null);
    };
  }, [id, callsign, expire, attempt, onRoute]);
  return (
    <section className="flight-route" aria-label="Flight route">
      <h3>Origin & destination</h3>
      {loading ? (
        <p role="status">Looking up flight route…</p>
      ) : route?.status === "available" && route.origin && route.destination ? (
        <>
          <div className="route-airports">
            {(
              [
                ["Origin", route.origin],
                ...route.via.map(
                  (airport, index) => [`Stop ${index + 1}`, airport] as const,
                ),
                ["Destination", route.destination],
              ] as const
            ).map(([label, airport]) => (
              <div key={label}>
                <span className="hud-label">{label}</span>
                <strong>{airport.iata ?? airport.icao}</strong>
                {typeof airport.latitude === "number" &&
                  typeof airport.longitude === "number" && (
                    <button onClick={() => onAirport(airport)}>
                      View {airport.iata ?? airport.icao} on map
                    </button>
                  )}
                <p>{airport.name}</p>
                <small>
                  {[airport.city, airport.country].filter(Boolean).join(", ")} ·{" "}
                  {airport.icao}
                </small>
              </div>
            ))}
          </div>
          {(route.airline || route.flightNumber) && (
            <p>
              {[route.airline, route.flightNumber].filter(Boolean).join(" · ")}
            </p>
          )}
          {[route.origin, ...route.via, route.destination].some(
            (airport) =>
              typeof airport.latitude !== "number" ||
              typeof airport.longitude !== "number",
          ) && (
            <p>
              Some airport coordinates are unavailable; only known route
              segments can be mapped.
            </p>
          )}
          <p className="route-reference">
            Callsign route reference; the current flight may differ.{" "}
            <a href="https://www.adsbdb.com/" target="_blank" rel="noreferrer">
              {route.source}
            </a>{" "}
            · Checked{" "}
            {new Date(route.fetchedAt).toLocaleString("en-US", {
              timeZone: "UTC",
            })}{" "}
            UTC
          </p>
        </>
      ) : (
        <p role="status">
          {!callsign || route?.status === "no-callsign"
            ? "Origin and destination unavailable: no flight callsign reported."
            : failed || route?.status === "unavailable"
              ? "Flight route lookup is temporarily unavailable."
              : "No origin or destination found for this callsign."}
        </p>
      )}
      {!loading && (failed || route?.status === "unavailable") && (
        <button onClick={() => setAttempt(attempt + 1)}>
          Retry flight route
        </button>
      )}
    </section>
  );
}
