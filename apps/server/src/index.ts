import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createAuthStore } from "./auth/store.js";
import { OpenSkyProvider } from "./aircraft/opensky.js";
import { createAircraftService } from "./aircraft/service.js";
import { regionForScope } from "./aircraft/types.js";
import { enrichAircraft, syncAircraftCatalog } from "./aircraft/catalog.js";
import { createFlightRouteLookup } from "./aircraft/flight-routes.js";
const database = createDatabase();
const origin = process.env.APP_ORIGIN ?? "http://localhost:8080";
if (new URL(origin).origin !== origin)
  throw new Error(
    "APP_ORIGIN must be an exact origin without a trailing slash.",
  );
const sessionSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 28800);
if (
  !Number.isInteger(sessionSeconds) ||
  sessionSeconds < 60 ||
  sessionSeconds > 86400
)
  throw new Error("SESSION_TTL_SECONDS must be between 60 and 86400.");
const aviationCacheSeconds = Number(
  process.env.AVIATION_CACHE_TTL_SECONDS ?? 120,
);
if (
  !Number.isInteger(aviationCacheSeconds) ||
  aviationCacheSeconds < 10 ||
  aviationCacheSeconds > 3600
)
  throw new Error("AVIATION_CACHE_TTL_SECONDS must be between 10 and 3600.");
const aviationScope = process.env.AVIATION_SCOPE ?? "worldwide";
const aviationRegion = regionForScope(aviationScope);
const openSkyClientId = process.env.OPENSKY_CLIENT_ID?.trim();
const openSkyClientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();
if (Boolean(openSkyClientId) !== Boolean(openSkyClientSecret))
  throw new Error(
    "OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET must be configured together.",
  );
if (aviationScope === "worldwide" && !openSkyClientId)
  throw new Error(
    "Worldwide OpenSky coverage requires OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET.",
  );
if (!openSkyClientId && aviationCacheSeconds < 216)
  throw new Error(
    "Anonymous São Paulo coverage requires AVIATION_CACHE_TTL_SECONDS of at least 216.",
  );
const positions = createAircraftService(
  new OpenSkyProvider({
    baseUrl: process.env.AVIATION_API_BASE_URL,
    tokenUrl: process.env.OPENSKY_TOKEN_URL,
    clientId: openSkyClientId,
    clientSecret: openSkyClientSecret,
  }),
  aviationRegion.bounds,
  { cacheTtlMs: aviationCacheSeconds * 1000 },
);
const lookupRoute = createFlightRouteLookup();
const aircraft = {
  region: aviationRegion,
  async getAircraft() {
    const snapshot = await positions.getAircraft();
    try {
      return {
        ...snapshot,
        aircraft: await enrichAircraft(database, snapshot.aircraft),
      };
    } catch {
      app.log.warn("Aircraft catalog unavailable; using reported categories.");
      return snapshot;
    }
  },
  async getRoute(id: string) {
    const snapshot = await positions.getAircraft();
    const position = snapshot.aircraft.find((item) => item.id === id);
    return position ? lookupRoute(position.callsign) : null;
  },
};
const app = createApp(
  async () => {
    await database.query(
      "SELECT u.id FROM users u LEFT JOIN sessions s ON s.user_id = u.id LIMIT 0",
    );
  },
  true,
  {
    store: createAuthStore(database),
    origin,
    secureCookie: origin.startsWith("https://"),
    sessionSeconds,
  },
  aircraft,
);
database.on("error", () =>
  app.log.error("An idle database connection failed."),
);
let syncTask: Promise<unknown> | null = null;
function refreshCatalog() {
  if (syncTask) return;
  syncTask = syncAircraftCatalog(database)
    .then((result) => {
      if (result) app.log.info(result, "Aircraft catalog updated.");
    })
    .catch(() =>
      app.log.warn(
        "Aircraft catalog refresh failed; retaining existing data and retrying later.",
      ),
    )
    .finally(() => {
      syncTask = null;
    });
}
const catalogTimer = setInterval(refreshCatalog, 3600000);
catalogTimer.unref();
app.addHook("onClose", async () => {
  clearInterval(catalogTimer);
  await syncTask;
  await database.end();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host: "0.0.0.0", port: 3000 });
  refreshCatalog();
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
