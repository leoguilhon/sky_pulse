import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createAuthStore } from "./auth/store.js";
import { OpenSkyProvider } from "./aircraft/opensky.js";
import { createAircraftService } from "./aircraft/service.js";
import { SAO_PAULO_REGION } from "./aircraft/types.js";
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
  process.env.AVIATION_CACHE_TTL_SECONDS ?? 300,
);
if (
  !Number.isInteger(aviationCacheSeconds) ||
  aviationCacheSeconds < 10 ||
  aviationCacheSeconds > 3600
)
  throw new Error("AVIATION_CACHE_TTL_SECONDS must be between 10 and 3600.");
const aircraft = createAircraftService(
  new OpenSkyProvider({
    baseUrl: process.env.AVIATION_API_BASE_URL,
    tokenUrl: process.env.OPENSKY_TOKEN_URL,
    clientId: process.env.OPENSKY_CLIENT_ID,
    clientSecret: process.env.OPENSKY_CLIENT_SECRET,
  }),
  SAO_PAULO_REGION.bounds,
  { cacheTtlMs: aviationCacheSeconds * 1000 },
);
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
app.addHook("onClose", async () => database.end());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host: "0.0.0.0", port: 3000 });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
