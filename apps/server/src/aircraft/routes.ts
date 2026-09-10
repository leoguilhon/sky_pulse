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
