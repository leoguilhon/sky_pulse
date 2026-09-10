import Fastify, { type FastifyError } from "fastify";
import { registerAuth, type AuthOptions } from "./auth/routes.js";
import { registerAircraftRoutes } from "./aircraft/routes.js";
import type { AircraftService } from "./aircraft/service.js";
export function createApp(
  checkDatabase: () => Promise<void>,
  logger = true,
  auth?: AuthOptions,
  aircraft?: AircraftService,
) {
  const app = Fastify({
    logger: logger
      ? {
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            'res.headers["set-cookie"]',
          ],
        }
      : false,
    bodyLimit: 4096,
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation)
      return reply.code(400).send({
        code: "INVALID_INPUT",
        message: "Check the submitted fields.",
      });
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({
        code: "REQUEST_REJECTED",
        message:
          error.statusCode === 429
            ? "Too many attempts. Try again in a minute."
            : "The request could not be accepted.",
      });
    request.log.error({ requestId: request.id }, "Request failed.");
    return reply.code(503).send({
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable. Please try again.",
    });
  });
  if (auth)
    app.register(async (instance) => {
      const requireSession = await registerAuth(instance, auth);
      if (aircraft)
        await registerAircraftRoutes(instance, aircraft, requireSession);
    });
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
