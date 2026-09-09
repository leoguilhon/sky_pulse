import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
const database = createDatabase();
const app = createApp(async () => {
  await database.query("SELECT id FROM users LIMIT 0");
});
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
