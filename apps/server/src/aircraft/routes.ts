import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AircraftProviderError } from "./types.js";
import { SAO_PAULO_REGION } from "./types.js";
import type { AircraftService } from "./service.js";

type SessionGuard = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>;

export async function registerAircraftRoutes(
  app: FastifyInstance,
  service: AircraftService,
  requireSession: SessionGuard,
) {
  app.get<{ Params: { id: string } }>(
    "/api/aircraft/:id/route",
    {
      preHandler: requireSession,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[a-f0-9]{6}$" } },
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!service.getRoute)
        return reply
          .code(503)
          .send({ message: "Flight routes are temporarily unavailable." });
      const route = await service.getRoute(request.params.id);
      if (!route)
        return reply
          .code(404)
          .send({ message: "Aircraft is no longer in the current snapshot." });
      return route;
    },
  );
  app.get(
    "/api/aircraft",
    { preHandler: requireSession },
    async (request, reply) => {
      try {
        const snapshot = await service.getAircraft();
        return {
          ...snapshot,
          region: SAO_PAULO_REGION,
        };
      } catch (error) {
        if (error instanceof AircraftProviderError) {
          const rateLimited = error.code === "RATE_LIMITED";
          if (rateLimited && error.retryAfterSeconds) {
            reply.header("Retry-After", error.retryAfterSeconds);
          }
          return reply.code(rateLimited ? 429 : 503).send({
            code: `AVIATION_${error.code}`,
            message: error.message,
            ...(error.retryAfterSeconds
              ? { retryAfterSeconds: error.retryAfterSeconds }
              : {}),
          });
        }
        request.log.error({ requestId: request.id }, "Aircraft fetch failed.");
        return reply.code(503).send({
          code: "AVIATION_UNAVAILABLE",
          message: "Live aircraft are temporarily unavailable.",
        });
      }
    },
  );
}
