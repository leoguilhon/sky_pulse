export interface Session {
  user: { id: string; email: string };
  expiresAt: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "UNKNOWN",
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(options?.timeoutMs ?? 10000);
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: options?.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-SkyPulse-Request": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach SkyPulse. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const fallback =
      response.status === 429
        ? "Too many attempts. Try again in a minute."
        : "SkyPulse is temporarily unavailable. Please try again.";
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
      code?: unknown;
      retryAfterSeconds?: unknown;
    } | null;
    throw new ApiError(
      response.status,
      typeof data?.message === "string" ? data.message : fallback,
      typeof data?.code === "string" ? data.code : "UNKNOWN",
      typeof data?.retryAfterSeconds === "number"
        ? data.retryAfterSeconds
        : undefined,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
