export interface AircraftPosition {
  id: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  verticalRateMetersPerSecond: number | null;
  onGround: boolean;
  originCountry: string | null;
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
