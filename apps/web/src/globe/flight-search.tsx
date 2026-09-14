import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { AircraftPosition, AircraftResponse } from "../aircraft";

export function FlightSearch({
  onSelect,
  expire,
}: {
  onSelect: (aircraft: AircraftPosition) => void;
  expire: () => void;
}) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AircraftResponse | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    setData(null);
    const term = query.trim();
    if (!/^[a-zA-Z0-9]{2,8}$/.test(term)) {
      setStatus(term ? "Enter 2–8 letters or numbers." : "");
      return;
    }
    const abort = new AbortController();
    setStatus("Searching flights…");
    const timer = setTimeout(() => {
      void api<AircraftResponse>(
        `/api/aircraft?search=${encodeURIComponent(term)}`,
        undefined,
        { signal: abort.signal, timeoutMs: 12000 },
      )
        .then((result) => {
          if (!abort.signal.aborted) {
            setData(result);
            setStatus(
              result.aircraft.length
                ? ""
                : "No recent flights found in configured coverage.",
            );
          }
        })
        .catch((error: unknown) => {
          if (abort.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) expire();
          else
            setStatus("Flight search is unavailable. Edit the query to retry.");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, expire]);
  return (
    <section className="flight-search" aria-label="Flight search">
      <label htmlFor="flight-search">Find a flight</label>
      <input
        id="flight-search"
        value={query}
        maxLength={8}
        placeholder="Callsign or ICAO24"
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {status && <p role="status">{status}</p>}
      {data && data.aircraft.length > 0 && (
        <>
          <p>
            {data.stale ? "Stale snapshot" : "Latest snapshot"} ·{" "}
            {data.region.name} · Up to 20 matches
          </p>
          <ul>
            {data.aircraft.map((aircraft) => (
              <li key={aircraft.id}>
                <button
                  onClick={() => {
                    onSelect(aircraft);
                    setQuery("");
                  }}
                >
                  {aircraft.callsign ?? aircraft.id.toUpperCase()} ·{" "}
                  {aircraft.id.toUpperCase()}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
