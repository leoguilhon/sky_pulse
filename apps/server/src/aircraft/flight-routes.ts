export interface RouteAirport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string | null;
}
export interface FlightRoute {
  status: "available" | "not-found" | "unavailable" | "no-callsign";
  callsign: string | null;
  source: string;
  fetchedAt: string;
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  via: RouteAirport[];
  airline: string | null;
  flightNumber: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
function airport(value: unknown): RouteAirport | null {
  const row = record(value);
  const icao = text(row.icao_code);
  const name = text(row.name);
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao) || !name) return null;
  return {
    icao,
    name,
    iata: text(row.iata_code),
    city: text(row.municipality),
    country: text(row.country_name),
  };
}

export function createFlightRouteLookup(
  options: { fetch?: typeof fetch; now?: () => number; baseUrl?: string } = {},
) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: FlightRoute }>();
  const pending = new Map<string, Promise<FlightRoute>>();
  let blockedUntil = 0;
  let windowStart = 0;
  let requests = 0;
  const empty = (
    callsign: string | null,
    status: FlightRoute["status"],
  ): FlightRoute => ({
    callsign,
    status,
    source: "adsbdb",
    fetchedAt: new Date(now()).toISOString(),
    origin: null,
    destination: null,
    via: [],
    airline: null,
    flightNumber: null,
  });
  return async (rawCallsign: string | null): Promise<FlightRoute> => {
    const callsign = rawCallsign?.trim().toUpperCase() ?? null;
    if (!callsign || !/^[A-Z0-9]{2,8}$/.test(callsign))
      return empty(callsign, "no-callsign");
    const existing = cache.get(callsign);
    if (existing && existing.expires > now()) return existing.value;
    const active = pending.get(callsign);
    if (active) return active;
    if (now() - windowStart >= 60000) {
      windowStart = now();
      requests = 0;
    }
    if (now() < blockedUntil || pending.size >= 2 || requests >= 30)
      return empty(callsign, "unavailable");
    requests++;
    const task = (async () => {
      let result: FlightRoute;
      let ttl = 6 * 3600000;
      try {
        const response = await request(
          `${options.baseUrl ?? "https://api.adsbdb.com/v0"}/callsign/${encodeURIComponent(callsign)}`,
          {
            signal: AbortSignal.timeout(7000),
            headers: { Accept: "application/json" },
          },
        );
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const seconds =
            retry && /^\d+$/.test(retry)
              ? Number(retry)
              : retry
                ? (Date.parse(retry) - now()) / 1000
                : 60;
          blockedUntil =
            now() +
            Math.max(60000, Number.isFinite(seconds) ? seconds * 1000 : 60000);
        }
        if (response.status === 404) {
          result = empty(callsign, "not-found");
          ttl = 3600000;
        } else {
          if (!response.ok) throw new Error("Route provider unavailable.");
          const data = record(record(await response.json()).response);
          const route = record(data.flightroute);
          const matching = [
            route.callsign,
            route.callsign_icao,
            route.callsign_iata,
          ].some((value) => text(value)?.toUpperCase() === callsign);
          const origin = airport(route.origin);
          const destination = airport(route.destination);
          const midpoint =
            route.midpoint == null ? null : airport(route.midpoint);
          if (
            !matching ||
            !origin ||
            !destination ||
            (route.midpoint != null && !midpoint)
          )
            throw new Error("Invalid route response.");
          result = {
            ...empty(callsign, "available"),
            origin,
            destination,
            via: midpoint ? [midpoint] : [],
            airline: text(record(route.airline).name),
            flightNumber: text(route.callsign_iata),
          };
        }
      } catch {
        result = empty(callsign, "unavailable");
        ttl = 30000;
      }
      // Ephemeral lookup cache only; the upstream route database is not mirrored.
      for (const [key, entry] of cache)
        if (entry.expires <= now()) cache.delete(key);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(callsign, { value: result, expires: now() + ttl });
      return result;
    })();
    pending.set(callsign, task);
    try {
      return await task;
    } finally {
      pending.delete(callsign);
    }
  };
}
