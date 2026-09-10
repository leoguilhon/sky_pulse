import { useEffect, useState } from "react";
import { api, ApiError } from "../api";

interface Airport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string | null;
}
interface Route {
  status: "available" | "not-found" | "unavailable" | "no-callsign";
  callsign: string | null;
  source: string;
  fetchedAt: string;
  origin: Airport | null;
  destination: Airport | null;
  via: Airport[];
  airline: string | null;
  flightNumber: string | null;
}

export function FlightRoute({
  id,
  callsign,
  expire,
}: {
  id: string;
  callsign: string | null;
  expire: () => void;
}) {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(Boolean(callsign));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!callsign) return;
    const abort = new AbortController();
    setLoading(true);
    setFailed(false);
    setRoute(null);
    void api<Route>(`/api/aircraft/${id}/route`, undefined, {
      signal: abort.signal,
      timeoutMs: 10000,
    })
      .then((data) => {
        if (!abort.signal.aborted) setRoute(data);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, callsign, expire, attempt]);
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
                ["Destination", route.destination],
              ] as const
            ).map(([label, airport]) => (
              <div key={label}>
                <span className="hud-label">{label}</span>
                <strong>{airport.iata ?? airport.icao}</strong>
                <p>{airport.name}</p>
                <small>
                  {[airport.city, airport.country].filter(Boolean).join(", ")} ·{" "}
                  {airport.icao}
                </small>
              </div>
            ))}
          </div>
          {route.via.length > 0 && (
            <p>
              Via{" "}
              {route.via
                .map(
                  (airport) =>
                    `${airport.iata ?? airport.icao} (${airport.name})`,
                )
                .join(", ")}
            </p>
          )}
          {(route.airline || route.flightNumber) && (
            <p>
              {[route.airline, route.flightNumber].filter(Boolean).join(" · ")}
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
