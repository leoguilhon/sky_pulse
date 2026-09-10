import {
  AircraftProviderError,
  type AircraftPosition,
  type AircraftProvider,
  type GeographicBounds,
  type ProviderSnapshot,
} from "./types.js";

interface OpenSkyOptions {
  baseUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

const numberAt = (state: unknown[], index: number) => {
  const value = state[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const textAt = (state: unknown[], index: number) => {
  const value = state[index];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export function normalizeOpenSkyState(
  value: unknown,
  observedAtSeconds: number,
): AircraftPosition | null {
  if (!Array.isArray(value)) return null;
  const id = textAt(value, 0)?.toLowerCase();
  const longitude = numberAt(value, 5);
  const latitude = numberAt(value, 6);
  if (
    !id ||
    !/^[a-f0-9]{6}$/.test(id) ||
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  const timePosition = numberAt(value, 3);
  const lastContact = numberAt(value, 4);
  const updatedSeconds = timePosition ?? lastContact ?? observedAtSeconds;
  return {
    id,
    callsign: textAt(value, 1),
    latitude,
    longitude,
    altitudeMeters: numberAt(value, 7) ?? numberAt(value, 13),
    speedMetersPerSecond: numberAt(value, 9),
    headingDegrees: numberAt(value, 10),
    verticalRateMetersPerSecond: numberAt(value, 11),
    onGround: value[8] === true,
    originCountry: textAt(value, 2),
    lastUpdated: new Date(updatedSeconds * 1000).toISOString(),
  };
}

function positiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export class OpenSkyProvider implements AircraftProvider {
  readonly name = "OpenSky Network";
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly requestTimeoutMs: number;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private token: AccessToken | null = null;

  constructor(options: OpenSkyOptions = {}) {
    this.baseUrl = (
      options.baseUrl ?? "https://opensky-network.org/api"
    ).replace(/\/$/, "");
    this.tokenUrl =
      options.tokenUrl ??
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
    this.clientId = options.clientId || undefined;
    this.clientSecret = options.clientSecret || undefined;
    if (
      (this.clientId && !this.clientSecret) ||
      (!this.clientId && this.clientSecret)
    ) {
      throw new Error(
        "OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET must be configured together.",
      );
    }
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private requestSignal(signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(this.requestTimeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  private async accessToken(signal?: AbortSignal, refresh = false) {
    if (!this.clientId || !this.clientSecret) return null;
    if (!refresh && this.token && this.token.expiresAt > this.now() + 30000) {
      return this.token.value;
    }
    let response: Response;
    try {
      response = await this.request(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: this.requestSignal(signal),
      });
    } catch {
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "Live aircraft authentication is temporarily unavailable.",
      );
    }
    if (!response.ok) {
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "Live aircraft authentication was rejected by the provider.",
      );
    }
    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (typeof body?.access_token !== "string") {
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "Live aircraft authentication returned an invalid response.",
      );
    }
    const expiresIn =
      typeof body.expires_in === "number" && body.expires_in > 0
        ? body.expires_in
        : 1800;
    this.token = {
      value: body.access_token,
      expiresAt: this.now() + expiresIn * 1000,
    };
    return this.token.value;
  }

  private async statesRequest(
    bounds: GeographicBounds,
    signal?: AbortSignal,
    refreshToken = false,
  ) {
    const url = new URL(`${this.baseUrl}/states/all`);
    url.search = new URLSearchParams({
      lamin: String(bounds.minimumLatitude),
      lamax: String(bounds.maximumLatitude),
      lomin: String(bounds.minimumLongitude),
      lomax: String(bounds.maximumLongitude),
    }).toString();
    const token = await this.accessToken(signal, refreshToken);
    return this.request(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: this.requestSignal(signal),
    });
  }

  async fetchAircraft(
    bounds: GeographicBounds,
    signal?: AbortSignal,
  ): Promise<ProviderSnapshot> {
    let response: Response;
    try {
      response = await this.statesRequest(bounds, signal);
      if (response.status === 401 && this.clientId) {
        response = await this.statesRequest(bounds, signal, true);
      }
    } catch (error) {
      if (error instanceof AircraftProviderError) throw error;
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "The live aircraft provider could not be reached.",
      );
    }
    const retryAfter =
      positiveInteger(
        response.headers.get("x-rate-limit-retry-after-seconds"),
      ) ?? positiveInteger(response.headers.get("retry-after"));
    if (response.status === 429) {
      throw new AircraftProviderError(
        "RATE_LIMITED",
        "The live aircraft provider rate limit has been reached.",
        retryAfter ?? 300,
      );
    }
    if (!response.ok) {
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "The live aircraft provider is temporarily unavailable.",
      );
    }
    const body = (await response.json().catch(() => null)) as {
      time?: unknown;
      states?: unknown;
    } | null;
    if (
      typeof body?.time !== "number" ||
      !Number.isFinite(body.time) ||
      (body.states !== null && !Array.isArray(body.states))
    ) {
      throw new AircraftProviderError(
        "UNAVAILABLE",
        "The live aircraft provider returned an invalid response.",
      );
    }
    const aircraft = (body.states ?? [])
      .map((state) => normalizeOpenSkyState(state, body.time as number))
      .filter((state): state is AircraftPosition => state !== null);
    return {
      aircraft,
      observedAt: new Date(body.time * 1000).toISOString(),
      remainingCredits: positiveInteger(
        response.headers.get("x-rate-limit-remaining"),
      ),
    };
  }
}
