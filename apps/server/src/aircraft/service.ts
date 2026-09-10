import type { FlightRoute } from "./flight-routes.js";
import {
  AircraftProviderError,
  type AircraftPosition,
  type AircraftProvider,
  type GeographicBounds,
} from "./types.js";

export interface AircraftSnapshot {
  aircraft: AircraftPosition[];
  observedAt: string;
  fetchedAt: string;
  provider: string;
  cached: boolean;
  stale: boolean;
}

export interface AircraftService {
  getAircraft(): Promise<AircraftSnapshot>;
  getRoute?(id: string): Promise<FlightRoute | null>;
}

interface ServiceOptions {
  cacheTtlMs?: number;
  staleTtlMs?: number;
  now?: () => number;
}

interface CachedSnapshot extends AircraftSnapshot {
  cachedAt: number;
}

export function createAircraftService(
  provider: AircraftProvider,
  bounds: GeographicBounds,
  options: ServiceOptions = {},
): AircraftService {
  const cacheTtlMs = options.cacheTtlMs ?? 300000;
  const staleTtlMs = options.staleTtlMs ?? 900000;
  const now = options.now ?? Date.now;
  let cached: CachedSnapshot | null = null;
  let pending: Promise<AircraftSnapshot> | null = null;
  let blockedUntil = 0;

  const cachedResponse = (stale: boolean): AircraftSnapshot => ({
    aircraft: cached!.aircraft,
    observedAt: cached!.observedAt,
    fetchedAt: cached!.fetchedAt,
    provider: cached!.provider,
    cached: true,
    stale,
  });

  return {
    async getAircraft() {
      const currentTime = now();
      if (cached && currentTime - cached.cachedAt < cacheTtlMs) {
        return cachedResponse(cached.stale);
      }
      if (currentTime < blockedUntil) {
        if (cached && currentTime - cached.cachedAt < staleTtlMs) {
          return cachedResponse(true);
        }
        throw new AircraftProviderError(
          "RATE_LIMITED",
          "Live aircraft updates are temporarily rate limited.",
          Math.ceil((blockedUntil - currentTime) / 1000),
        );
      }
      if (pending) return pending;
      pending = provider
        .fetchAircraft(bounds)
        .then((snapshot) => {
          const fetchedAt = now();
          const stale = Date.parse(snapshot.observedAt) < fetchedAt - 120000;
          cached = {
            ...snapshot,
            fetchedAt: new Date(fetchedAt).toISOString(),
            provider: provider.name,
            cached: false,
            stale,
            cachedAt: fetchedAt,
          };
          return {
            aircraft: cached.aircraft,
            observedAt: cached.observedAt,
            fetchedAt: cached.fetchedAt,
            provider: cached.provider,
            cached: false,
            stale,
          };
        })
        .catch((error: unknown) => {
          if (
            error instanceof AircraftProviderError &&
            error.code === "RATE_LIMITED"
          ) {
            blockedUntil = now() + (error.retryAfterSeconds ?? 300) * 1000;
          }
          if (cached && now() - cached.cachedAt < staleTtlMs) {
            return cachedResponse(true);
          }
          throw error;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
