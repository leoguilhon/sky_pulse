# SkyPulse

Explore the world's air traffic in real time.

SkyPulse includes the Docker foundation, authentication, an interactive Earth, live aircraft, and Phase 5 aircraft inspection. Sign in to explore a 3D globe with real continent outlines, rotation, zoom, geographic navigation, and a live regional aircraft snapshot from OpenSky Network.

## Start with Docker

Prerequisites: Docker Engine with Compose v2 or later, or Docker Desktop running Linux containers. No host Node.js or database installation is required.

1. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on Linux/macOS).
2. Set `POSTGRES_PASSWORD` to a unique local password. Enclose values containing literal `$` or `#` in single quotes in `.env`. Never commit this file.
3. Run `docker compose up --build`.
4. Create your first account using the interactive command below.
5. Open <http://localhost:8080> and sign in. Successful login opens `/app`.

```sh
docker compose exec server npm run user:create --workspace @skypulse/server
```

Enter an email and a password containing 12-128 characters. Password entry is hidden and requires confirmation. The command inserts the password hash only; duplicate emails are rejected without changing the existing account. There is no default account, public registration, or password reset flow. Noninteractive tooling can pass a JSON object with `email` and `password` over stdin to `docker compose exec -T server node apps/server/dist/create-user.js`; avoid placing credentials in command arguments or shell history.

The database must become healthy before the API starts. The API applies migrations before listening; the web service starts once the API and schema are ready. Failed migrations prevent API startup. Existing Phase 1 volumes are upgraded automatically without removing data.

```sh
docker compose ps
docker compose logs server
docker compose down
```

`down` preserves users and sessions in the database volume. Changing `POSTGRES_PASSWORD` does not change an existing database role password: initialization variables apply only to a new volume. Do not remove a volume containing data you need. After source changes, run `docker compose up --build` again.

If Docker cannot connect to the daemon, start Docker Desktop or Docker Engine first. If port 8080 is occupied, change `WEB_PORT` and recreate the services. Use the browser origin configured in `APP_ORIGIN`; `localhost` and `127.0.0.1` are different origins.

## Architecture and configuration

```text
Browser -> web (Nginx, localhost:8080)
              -> /api/* -> server (Fastify, internal:3000)
                              -> database (PostgreSQL, internal:5432)
```

Only the web port is published, bound to localhost. Database credentials are passed at runtime and excluded from image build contexts. Both application containers run as non-root users.

| Variable                                      | Default                       | Purpose                                                                                                             |
| --------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                           | Required                      | Database password used by database and server.                                                                      |
| `WEB_PORT`                                    | `8080`                        | Web port bound to `127.0.0.1`.                                                                                      |
| `DB_HOST`                                     | `database`                    | Backend database hostname, set by Compose.                                                                          |
| `APP_ORIGIN`                                  | `http://localhost:<WEB_PORT>` | Exact browser origin, without a trailing slash. Checked on all authentication writes. HTTPS enables Secure cookies. |
| `SESSION_TTL_SECONDS`                         | `28800`                       | Fixed session lifetime (8 hours), between 60 and 86400 seconds. Applies to new sessions.                            |
| `AVIATION_CACHE_TTL_SECONDS`                  | `300`                         | Shared live snapshot lifetime (10-3600 seconds). The default protects the anonymous OpenSky credit allowance.       |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | Empty                         | Optional OpenSky OAuth client credentials. Both must be configured together.                                        |
| `AVIATION_API_BASE_URL` / `OPENSKY_TOKEN_URL` | OpenSky endpoints             | Optional provider endpoint overrides for development and compatible test services.                                  |

The database and database user are both named `skypulse`. For optional host Vite development, use `APP_ORIGIN=http://localhost:5173` in the backend environment. The default Compose workflow uses compiled images; host API development additionally requires a reachable migrated database and its credentials.

## Authentication

Passwords use Node.js scrypt with random salts (`N=32768`, `r=8`, `p=3`), and constant-time derived-key comparison. Login creates a random 256-bit opaque token; PostgreSQL stores only its SHA-256 digest. The browser receives a host-only `HttpOnly`, `SameSite=Strict` cookie. HTTPS origins add `Secure` and the `__Host-` cookie prefix. Local HTTP is supported for Docker development.

Session tokens never appear in JSON responses or browser storage. The frontend restores the session on reload, checks it on window focus and every minute while signed in, and clears protected content at the expiration deadline or after a 401 response. A network failure presents a retry state. There are no refresh tokens: expired sessions require another login.

The server checks session validity for each protected request. Logout deletes the session from PostgreSQL before clearing the cookie; a service failure is reported so users can retry. Reauthentication replaces the current browser token. Other browser sessions remain independent. Expired database records are removed during subsequent successful logins.

Mutating API requests require the exact configured `Origin` plus `X-SkyPulse-Request: 1`; cross-origin access is not enabled. Login is limited to 10 requests per minute **across the single API process**, including successful attempts. This deliberately small local limit needs revisiting with per-client/account policies and shared storage before scaling to multiple instances.

| Endpoint                | Access                               | Behavior                                                                     |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `POST /api/auth/login`  | Public, origin checked, rate limited | Accepts `{email,password}`, sets session cookie, returns `{user,expiresAt}`. |
| `GET /api/auth/session` | Authenticated                        | Returns `{user,expiresAt}` or 401.                                           |
| `POST /api/auth/logout` | Origin checked                       | Revokes current token, clears cookie, returns 204; safe to repeat.           |
| `GET /api/workspace`    | Authenticated                        | Initial protected application data.                                          |
| `GET /api/health/live`  | Public                               | API responsiveness.                                                          |
| `GET /api/health/ready` | Public                               | Database and required table readiness; 503 when unavailable.                 |
| `GET /healthz`          | Public                               | Nginx responsiveness.                                                        |

Authentication responses use `Cache-Control: no-store`. Invalid credentials return the same error for unknown users and incorrect passwords. Backend failures do not expose connection details or credentials.

## Earth explorer

After login, the globe fills the protected workspace, initially centered on Brazil. Drag to navigate; scroll or pinch to zoom. Presets cover Brazil, Europe, Asia, and a detailed city view of São Paulo. Use the on-screen zoom buttons and reset control, or focus the globe and use arrow keys, `+`/`-`, and `Home`.

The readout shows map-center coordinates and cartographic zoom (0.5-18). Zooming in progressively reveals country and state boundaries, state names, cities, neighborhoods, and roads where available in the map data. MapLibre transitions from a globe overview to a local map as you approach. Labels are placed to reduce overlap. Region transitions respect reduced-motion preferences, and the viewport resizes with the window.

The map uses MapLibre GL JS with the OpenFreeMap Dark vector style, customized as a subdued basemap so aircraft retain the visual priority. OpenFreeMap serves OpenStreetMap/OpenMapTiles tiles, fonts, and symbols directly to the browser. Internet access is required; no map API key is needed. Only visible tiles and required detail levels are requested, with a bounded renderer cache. Place names prefer English where available and otherwise retain source geographic names. Attribution stays visible, and style licenses are included in `apps/web/public/maps/`.

WebGL is required. Unsupported graphics, context loss, and loading failures display recovery instructions while keeping logout available. Partial map outages display a reload notice rather than presenting incomplete data as complete. The map and its resources are removed when leaving the workspace. MapLibre loads only after authorization. Map requests never include SkyPulse credentials. To change providers, update the style source/glyph/sprite URLs and the map host allowlist in Nginx; see `apps/web/public/maps/README.md`.

## Live aircraft

The authenticated `GET /api/aircraft` endpoint loads a live snapshot for a 5 × 5 degree São Paulo region (`-25.5…-20.5` latitude, `-49.5…-44.5` longitude). Aircraft with valid coordinates are normalized into SkyPulse's provider-independent model and rendered as one batched GeoJSON layer. Missing callsigns, altitude, speed, heading, and other optional values are accepted; rows without valid coordinates are omitted.

The browser never contacts OpenSky or receives provider credentials. The server supports anonymous OpenSky access by default and optional OAuth client credentials through `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`. OAuth access tokens are cached until shortly before expiry and refreshed once after an unauthorized response.

Snapshots are shared in memory across users for five minutes by default. This keeps the 25-square-degree query at one OpenSky credit and prevents page loads from multiplying external requests. Concurrent cache misses share the same request. Provider `429` cooldowns are honored, and the last snapshot can be served as explicitly stale for up to 15 minutes during a rate limit or temporary outage. A missing or failed feed does not prevent geographic exploration. The browser refreshes its view every 30 seconds; OpenSky requests still use the shared five-minute cache. This also picks up newly imported aircraft metadata. Movement interpolation remains a future milestone.

OpenSky documents its live API for research and non-commercial use. Review the [OpenSky API documentation](https://openskynetwork.github.io/opensky-api/) and applicable terms before production or commercial deployment. Aircraft attribution is displayed in the workspace.

### Aircraft inspection and shapes (Phase 5)

Click an aircraft or use **Inspect aircraft** to select it. The gold silhouette and ring identify the selection. Click empty map space, press Escape while focused on the globe or inspector, or close the panel to clear it. Selection uses the existing position snapshot and queries flight-route metadata separately by the selected aircraft's callsign.

The panel shows callsign (ICAO24 fallback), altitude in feet, ground speed in knots, heading / true track in degrees, vertical rate in feet per minute, coordinates, registration country, available model/type information, and the UTC position timestamp. Missing values are explicitly unavailable and stale snapshots retain their warning. The country is inferred from the transponder address, not the flight's departure country.

The [OpenSky state-vector API](https://openskynetwork.github.io/opensky-api/rest.html) is requested with `extended=1`. Reported categories distinguish light, small, large, heavy, high-performance, rotorcraft, glider, lighter-than-air, and unmanned aircraft. Surface vehicles and obstacles are excluded. Shapes follow the reported true track; missing track uses north as a display fallback without inventing a heading in the panel. Gray indicates ground status; the legend explains the symbols.

The server enriches OpenSky positions from a persistent PostgreSQL catalog: ICAO24 maps to registration, type code, model and operator; a type catalog supplies ICAO airframe/engine descriptors and wake category. The renderer uses these characteristics as well as recognized type codes to distinguish single-engine, multi-engine propeller, jet, heavy, and rotorcraft silhouettes. Missing or ambiguous metadata remains unknown rather than being guessed from speed or callsign.

### Aircraft catalog and flight routes

The catalog is downloaded from [tar1090-db](https://github.com/wiedehopf/tar1090-db) and [Mictronics type data](https://github.com/Mictronics/readsb-protobuf/blob/dev/webapp/src/db/types.json). It contains over 600,000 aircraft records and thousands of aircraft types. The first server startup imports it in the background. Imports refresh after seven days, checked hourly; errors retain the previous catalog and retry at the next check. Aircraft appear immediately with available feed categories, then gain details on a subsequent refresh. Database import is atomic, validates identifiers/structure/minimum record counts, and uses bounded downloads and batched inserts. No external data files are bundled into the frontend.

To force a catalog refresh:

```bash
docker compose exec server node apps/server/dist/aircraft/sync-catalog.js
```

To inspect import status:

```bash
docker compose exec database psql -U skypulse -d skypulse -c "SELECT * FROM aircraft_catalog_sync;"
```

Flight inspection shows origin and destination airport codes, names, cities, optional intermediate airport, airline, and flight number using the [adsbdb callsign API](https://github.com/mrjackwills/adsbdb). These are **callsign route references**, not confirmed live flight plans: reused callsigns, multi-leg services, diversions and charter/private flights may differ or have no result. The UI explicitly labels this and distinguishes absent callsigns, missing routes, and temporary lookup failures.

`GET /api/aircraft/:icao24/route` requires authentication and resolves the callsign from the server's current regional snapshot. It does not accept arbitrary callsigns from the browser. Lookups have a seven-second timeout, at most two concurrent requests, a maximum of 30 requests/minute, shared in-flight requests, and a bounded memory cache (six hours for matches, one hour for misses, 30 seconds for errors). HTTP 429 cooldowns are honored globally. Route responses use `Cache-Control: no-store`; the server's short-lived lookup cache is not persisted or incorporated into the aircraft database. The upstream credits David Taylor and Jim Mason for route data and restricts copying its route database; SkyPulse does not mirror that database. Route-provider failures do not affect aircraft positions or catalog access.

## Development and quality

```sh
docker build --target quality -f apps/server/Dockerfile .
```

This runs type checking, lint, formatting checks, API/password tests, and both builds inside Docker. Alternatively, with Node.js 22.12+ and npm installed:

```sh
npm ci
npm run check
npm run build
```

Browser integration tests require the running Docker environment plus host Node.js:

```sh
npx playwright install chromium
npm run test:e2e
```

Set `APP_ORIGIN` or `WEB_PORT` in the test shell if using a nondefault URL. Tests create an isolated random account through the provisioning command and remove it afterward, cascading its sessions. They verify login errors, route protection, browser session restoration, logout revocation, server and client expiration, and network failure recovery. Repeated runs within one minute may hit the intentional shared login limit; wait for the window before rerunning.

Conventions: strict TypeScript, ESLint, Prettier, UTF-8, LF line endings, English source/documentation, small modules, and no committed secrets. Run `npm run format` before submitting changes.

## Database migrations

Ordered SQL files live in `apps/server/migrations`: `001_create_users.sql` defines users; `002_create_sessions.sql` defines expiring sessions. Add migrations with increasing, zero-padded numeric prefixes. Never edit an applied migration: SHA-256 checksums detect changes. Pending migrations run transactionally under a PostgreSQL advisory lock. SQL must support transactional execution. Corrections use new forward migrations; automatic destructive rollback is not provided.

```sh
docker compose exec server npm run migrate --workspace @skypulse/server
```

The `updated_at` user field is initialized by the schema; future user updates must maintain it in application code.

## Project map and next steps

- `apps/web`: React application, login/session handling, Vite, and Nginx.
- `apps/server`: Fastify API, authentication, provisioning, migrations, and unit tests.
- `tests/e2e`: Playwright browser tests against Docker and PostgreSQL.
- `compose.yaml`: services, health checks, and persistent storage.
- `docs/architecture.md`: architectural decisions.
- `PROJECT_CONTEXT.md`: product direction and phase roadmap.

Phase 4 is implemented with a provider abstraction, normalized regional OpenSky data, shared rate-aware caching, graceful feed states, and batched aircraft rendering. Phase 5 adds aircraft selection, an inspection panel, heading-oriented category silhouettes, and a gold selection highlight. This is a local development environment; production requires TLS termination, deployment secret management, separate migration/runtime database roles, validation of provider licensing for the intended use, and appropriate login limiting for the deployment size.
