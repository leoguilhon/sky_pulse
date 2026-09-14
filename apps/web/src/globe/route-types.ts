export interface Airport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface Route {
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
