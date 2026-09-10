export interface GeographicBounds {
  minimumLatitude: number;
  maximumLatitude: number;
  minimumLongitude: number;
  maximumLongitude: number;
}

export const SAO_PAULO_REGION = {
  name: "São Paulo region",
  bounds: {
    minimumLatitude: -25.5,
    maximumLatitude: -20.5,
    minimumLongitude: -49.5,
    maximumLongitude: -44.5,
  },
} as const;

export interface AircraftPosition {
  id: string;
  callsign: string | null;
  category: string | null;
  model?: string | null;
  typeCode?: string | null;
  registration?: string | null;
  operator?: string | null;
  typeDescription?: string | null;
  wakeCategory?: string | null;
  metadataSource?: string;
  metadataUpdatedAt?: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  verticalRateMetersPerSecond: number | null;
  onGround: boolean;
  originCountry: string | null;
  positionUpdatedAt: string;
  lastUpdated: string;
}

export interface ProviderSnapshot {
  aircraft: AircraftPosition[];
  observedAt: string;
  remainingCredits: number | null;
}

export interface AircraftProvider {
  readonly name: string;
  fetchAircraft(
    bounds: GeographicBounds,
    signal?: AbortSignal,
  ): Promise<ProviderSnapshot>;
}

export type AircraftProviderFailure = "RATE_LIMITED" | "UNAVAILABLE";

export class AircraftProviderError extends Error {
  constructor(
    public readonly code: AircraftProviderFailure,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
