import { createHash, randomBytes } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  hashPassword,
  normalizeEmail,
  validEmail,
  verifyPassword,
} from "./password.js";
import type { AuthStore, Session } from "./store.js";

export interface AuthOptions {
  store: AuthStore;
  origin: string;
  secureCookie: boolean;
  sessionSeconds: number;
}
declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function registerAuth(app: FastifyInstance, options: AuthOptions) {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest("session", null);
  const cookieName = options.secureCookie ? "__Host-skypulse" : "skypulse";
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: options.secureCookie,
  };
  const dummyHash = await hashPassword(randomBytes(32).toString("hex"));
  const readToken = (request: FastifyRequest) => {
    const value = request.cookies[cookieName];
    return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
  };
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      (request.headers.origin !== options.origin ||
        request.headers["x-skypulse-request"] !== "1")
    ) {
      return reply
        .code(403)
        .send({ code: "FORBIDDEN", message: "Request origin is not allowed." });
    }
  });
  const requireSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const token = readToken(request);
    const session = token
      ? await options.store.findSession(tokenDigest(token))
      : undefined;
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      reply.clearCookie(cookieName, cookieOptions);
      return reply
        .code(401)
        .send({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
    }
    request.session = session;
  };
  app.post<{ Body: { email: string; password: string } }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: () => "login",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", minLength: 1, maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      if (!validEmail(email))
        return reply.code(400).send({
          code: "INVALID_INPUT",
          message: "Enter a valid email address.",
        });
      const user = await options.store.findUser(email);
      const valid = await verifyPassword(
        request.body.password,
        user?.passwordHash ?? dummyHash,
      );
      if (!valid || !user)
        return reply.code(401).send({
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect.",
        });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + options.sessionSeconds * 1000);
      const previous = readToken(request);
      await options.store.createSession(
        user.id,
        tokenDigest(token),
        expiresAt,
        previous ? tokenDigest(previous) : undefined,
      );
      reply.setCookie(cookieName, token, {
        ...cookieOptions,
        maxAge: options.sessionSeconds,
        expires: expiresAt,
      });
      return {
        user: { id: user.id, email: user.email },
        expiresAt: expiresAt.toISOString(),
      };
    },
  );
  app.get(
    "/api/auth/session",
    { preHandler: requireSession },
    async (request) => request.session,
  );
  app.post("/api/auth/logout", async (request, reply) => {
    const token = readToken(request);
    if (token) await options.store.revokeSession(tokenDigest(token));
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });
  app.get(
    "/api/workspace",
    { preHandler: requireSession },
    async (request) => ({
      user: request.session!.user,
      message: "Your SkyPulse workspace is ready.",
      nextMilestone: "Aircraft interaction",
    }),
  );
  return requireSession;
}
