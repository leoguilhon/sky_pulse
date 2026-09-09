import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createAuthStore } from "./auth/store.js";
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
