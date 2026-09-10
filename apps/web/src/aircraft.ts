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

export interface AircraftResponse {
  aircraft: AircraftPosition[];
  observedAt: string;
  fetchedAt: string;
  provider: string;
  cached: boolean;
  stale: boolean;
  region: {
    name: string;
    bounds: {
      minimumLatitude: number;
      maximumLatitude: number;
      minimumLongitude: number;
      maximumLongitude: number;
    };
  };
}
