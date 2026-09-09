import Fastify from "fastify";
export function createApp(checkDatabase: () => Promise<void>, logger = true) {
  const app = Fastify({ logger });
  app.get("/api/health/live", async () => ({ status: "ok" }));
  app.get("/api/health/ready", async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: "ok", database: "connected" };
    } catch {
      return reply
        .code(503)
        .send({ status: "unavailable", database: "unavailable" });
    }
  });
  return app;
}
