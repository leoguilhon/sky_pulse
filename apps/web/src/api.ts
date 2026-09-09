export interface Session {
  user: { id: string; email: string };
  expiresAt: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
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
    } | null;
    throw new ApiError(
      response.status,
      typeof data?.message === "string" ? data.message : fallback,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
