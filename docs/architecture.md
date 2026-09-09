# Phase 1 architecture

## Decision

Use an npm workspace with React + Vite for the browser and Fastify for the API, with strict TypeScript throughout. Use Node.js 22 container images and PostgreSQL 17. The repository initially contained only documentation, so there was no existing stack to preserve.

React provides an application shell that can host a geospatial renderer later. Vite builds static assets. Fastify provides a small HTTP foundation for authentication and provider adapters. PostgreSQL supports persistent users and future relational features. No ORM, cache service, real-time infrastructure, or geospatial library is necessary for this phase.

Official compatibility references: [Vite guide](https://vite.dev/guide/), [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/), and [PostgreSQL support policy](https://www.postgresql.org/support/versioning/).

## Deployment shape

Three Compose services: web, server, and database. Nginx serves compiled assets and proxies API calls, keeping credentials server-side and avoiding CORS configuration. Runtime DNS resolution allows reconnection after server container replacement. Only the web port is exposed on localhost. Named-volume storage survives container replacement.

Application images separate build and runtime stages and use non-root runtime users. `npm ci` uses the committed lockfile. Base images track supported release lines rather than immutable digests; image refreshes must be verified before deployment. The default workflow uses compiled images; rebuild after source changes.

## Persistence and boundaries

The initial schema prepares a minimal user record for Phase 2. A small SQL migration runner tracks checksums and applies migrations transactionally with a database lock. Readiness checks the user table as well as connectivity.

Future aviation adapters will live on the server and normalize provider payloads before exposing them to the browser. Shared flight contracts will be introduced with actual provider requirements. The Earth renderer remains a Phase 3 decision. No sample aircraft are presented as live data.
