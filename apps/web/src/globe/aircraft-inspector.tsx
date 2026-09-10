import type { AircraftPosition } from "../aircraft";
import { aircraftSymbol, aircraftSymbols } from "./aircraft-symbols";
import { FlightRoute } from "./flight-route";

const measurement = (
  value: number | null,
  unit: string,
  scale = 1,
  digits = 0,
) =>
  value === null || !Number.isFinite(value)
    ? "Not available"
    : `${(value * scale).toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}`;

export function AircraftInspector({
  aircraft,
  stale,
  provider,
  onClose,
  expire,
}: {
  aircraft: AircraftPosition;
  stale: boolean;
  provider: string;
  onClose: () => void;
  expire: () => void;
}) {
  const symbol = aircraftSymbols[aircraftSymbol(aircraft)];
  const fields = [
    ["Altitude", measurement(aircraft.altitudeMeters, "ft", 3.28084)],
    ["Ground speed", measurement(aircraft.speedMetersPerSecond, "kt", 1.94384)],
    ["Heading / true track", measurement(aircraft.headingDegrees, "°", 1, 1)],
    [
      "Vertical rate",
      measurement(aircraft.verticalRateMetersPerSecond, "ft/min", 196.8504),
    ],
    ["ICAO24", aircraft.id.toUpperCase()],
    ["Registration", aircraft.registration ?? "Not available"],
    ["Operator", aircraft.operator ?? "Not available"],
    ["Country of registration", aircraft.originCountry ?? "Not available"],
    ["Model", aircraft.model ?? "Not available"],
    ["ICAO type", aircraft.typeCode ?? "Not available"],
    ["Type description", aircraft.typeDescription ?? "Not available"],
    [
      "Reported category",
      aircraft.category?.replaceAll("-", " ") ?? "Not available",
    ],
    [
      "Position",
      `${aircraft.latitude.toFixed(4)}°, ${aircraft.longitude.toFixed(4)}°`,
    ],
  ];
  return (
    <aside
      className="aircraft-inspector"
      aria-labelledby="aircraft-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="hud-label">AIRCRAFT INSPECTION</span>
          <h2 id="aircraft-heading">
            {aircraft.callsign ?? aircraft.id.toUpperCase()}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Close aircraft details">
          ×
        </button>
      </header>
      <div className="aircraft-type">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d={symbol.path} />
        </svg>
        <div>
          <strong>{symbol.label}</strong>
          <p>
            {aircraft.onGround ? "On ground" : "Airborne"}
            {aircraft.callsign === null ? " · Callsign unavailable" : ""}
          </p>
        </div>
      </div>
      {stale && (
        <p className="snapshot-warning" role="status">
          Stale snapshot — these positions may be out of date.
        </p>
      )}
      <FlightRoute
        id={aircraft.id}
        callsign={aircraft.callsign}
        expire={expire}
      />
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <footer>
        Telemetry updated{" "}
        <time dateTime={aircraft.lastUpdated}>
          {new Date(aircraft.lastUpdated).toLocaleString("en-US", {
            timeZone: "UTC",
          })}{" "}
          UTC
        </time>
        {aircraft.positionUpdatedAt !== aircraft.lastUpdated && (
          <>
            <br />
            Position updated{" "}
            <time dateTime={aircraft.positionUpdatedAt}>
              {new Date(aircraft.positionUpdatedAt).toLocaleString("en-US", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </time>
          </>
        )}
        <br />
        {provider}
        {aircraft.metadataSource && (
          <>
            <br />
            <a
              href="https://github.com/wiedehopf/tar1090-db"
              target="_blank"
              rel="noreferrer"
            >
              Aircraft details: {aircraft.metadataSource}
            </a>
            {aircraft.metadataUpdatedAt && (
              <>
                {" "}
                · Catalog updated{" "}
                {new Date(aircraft.metadataUpdatedAt).toLocaleDateString(
                  "en-US",
                )}
              </>
            )}
          </>
        )}
      </footer>
    </aside>
  );
}

export function AircraftLegend() {
  return (
    <details className="aircraft-legend">
      <summary>Aircraft shapes</summary>
      <ul>
        {Object.entries(aircraftSymbols).map(([key, symbol]) => (
          <li key={key}>
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d={symbol.path} />
            </svg>
            {symbol.label}
          </li>
        ))}
      </ul>
      <p>
        Shapes use reported type or category. Unknown types use a diamond. Gray:
        on ground. Gold: selected.
      </p>
    </details>
  );
}
