# SkyPulse architecture

## Decision

Use an npm workspace with React + Vite for the browser and Fastify for the API, with strict TypeScript throughout. Use Node.js 22 container images and PostgreSQL 17. The repository initially contained only documentation, so there was no existing stack to preserve.

React provides an application shell that can host a geospatial renderer later. Vite builds static assets. Fastify provides a small HTTP foundation for authentication and provider adapters. PostgreSQL supports persistent users and future relational features. No ORM, cache service, real-time infrastructure, or geospatial library is necessary for this phase.

Official compatibility references: [Vite guide](https://vite.dev/guide/), [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/), and [PostgreSQL support policy](https://www.postgresql.org/support/versioning/).

## Deployment shape

Three Compose services: web, server, and database. Nginx serves compiled assets and proxies API calls, keeping credentials server-side and avoiding CORS configuration. Runtime DNS resolution allows reconnection after server container replacement. Only the web port is exposed on localhost. Named-volume storage survives container replacement.

Application images separate build and runtime stages and use non-root runtime users. `npm ci` uses the committed lockfile. Base images track supported release lines rather than immutable digests; image refreshes must be verified before deployment. The default workflow uses compiled images; rebuild after source changes.

## Persistence and boundaries

The user schema is extended in Phase 2 with persistent token sessions. A small SQL migration runner tracks checksums and applies migrations transactionally with a database lock. Readiness checks both tables and connectivity.

Future aviation adapters will live on the server and normalize provider payloads before exposing them to the browser. Shared flight contracts will be introduced with actual provider requirements. The Earth renderer remains a Phase 3 decision. No sample aircraft are presented as live data.

## Phase 2: authentication

Use opaque 256-bit session tokens instead of JWTs. PostgreSQL already exists, so storing token digests and expiration timestamps provides immediate logout revocation with no signing secret, refresh-token service, or additional infrastructure. Each protected request validates its session against the database. The fixed lifetime defaults to eight hours, and sessions survive application restarts. Expired rows are cleaned on successful login.

Store tokens in host-only HttpOnly, SameSite=Strict cookies. HTTPS origins use Secure cookies with a __Host- prefix. An exact configured Origin and a custom request header protect writes, including login and logout. Same-origin proxying avoids CORS. No token is stored in localStorage or returned in JSON. This follows the [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Use the [Node.js scrypt API](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) with random 16-byte salts and N=32768, r=8, p=3. Password provisioning accepts 12-128 characters; login accepts existing passwords up to that limit. Unknown accounts verify against a dummy hash to reduce user-enumeration timing differences. A conservative shared login limit bounds hashing load for the initial single-instance environment.

Provision accounts via a local CLI with hidden password input or JSON over stdin. No seed credentials are committed, and duplicate provisioning never resets an account. There is no public registration or complex permission system.

The frontend gates the /app view on a validated session. It restores sessions after reload, checks on focus and periodically, and removes protected content when a session expires. Network failures are recoverable without displaying protected content. The backend, rather than the frontend route, remains the authorization boundary. The reusable session pre-handler guards both the session endpoint and initial workspace endpoint.

API tests cover credentials, cookie properties, CSRF checks, token rotation, expiration, logout revocation, rate limiting, and storage failures. Playwright tests exercise real browser cookies and PostgreSQL using disposable accounts. Scaling beyond one API process will require revisiting the shared in-memory login limiter; this phase intentionally does not add Redis.
