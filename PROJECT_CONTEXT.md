# SkyPulse

## Project Overview

**SkyPulse** is a real-time global flight visualization platform.

The main experience should allow authenticated users to explore live air traffic around the world through an interactive **3D globe representing Earth**, with aircraft positioned according to real-world flight data.

The long-term vision is to create an immersive, modern, high-performance aviation visualization platform where users can rotate the planet, zoom into regions, inspect individual aircraft, search for flights and airports, visualize routes, and understand global air traffic in real time.

Possible product tagline:

> **SkyPulse — Explore the world's air traffic in real time.**

---

# Core Principles

SkyPulse should be built around the following principles:

1. **Real-world flight data**
2. **Interactive 3D visualization**
3. **Smooth aircraft movement**
4. **High performance**
5. **Scalable architecture**
6. **Clean and modern UI**
7. **Provider-independent flight data architecture**
8. **Simple authentication and access control**
9. **Fully containerized development environment**
10. **Progressive development through small, functional milestones**

The application should not attempt to implement every planned feature immediately.

Start with a small but functional MVP and evolve incrementally.

---

# Language

The entire project must be written in **English**.

This includes:

* source code;
* variable names;
* function names;
* class names;
* database fields;
* API contracts;
* UI text;
* documentation;
* comments;
* configuration descriptions;
* error messages.

Development instructions may be provided in Portuguese, but everything persisted in the repository must remain in English.

---

# Technology Decisions

Do not blindly follow a predefined technology stack.

Before implementing the project:

1. Inspect the repository.
2. Determine whether an existing stack already exists.
3. If the repository is empty, choose an appropriate modern stack based on the requirements described in this document.
4. Prefer technologies that are:

   * actively maintained;
   * suitable for real-time applications;
   * appropriate for 3D geospatial visualization;
   * easy to maintain;
   * well documented;
   * compatible with Docker;
   * compatible with future scaling.

The architecture should support:

* a web frontend;
* a backend service;
* authentication;
* token-based access control;
* external aviation data providers;
* real-time or near-real-time updates;
* 3D geospatial rendering;
* caching;
* persistence where required;
* shared contracts/types when appropriate;
* Docker-based local development.

Do not introduce unnecessary infrastructure during the first milestone.

---

# Authentication

SkyPulse must include a **simple login system** from the beginning.

Authentication should be intentionally small and easy to maintain.

The application should support:

* user login;
* secure password storage;
* token-based authentication;
* protected backend endpoints;
* authenticated frontend sessions;
* logout;
* token expiration handling.

A typical flow may look like:

```text
User
  |
  v
Login Form
  |
  v
Backend Authentication
  |
  v
Credentials Validation
  |
  v
Access Token
  |
  v
Authenticated Client
```

The exact authentication mechanism should be selected by the implementation agent based on the chosen stack.

A token format such as JWT may be appropriate, but do not assume it if another simple and secure approach is better suited to the selected stack.

Passwords must never be stored in plain text.

Use a secure password hashing strategy.

Authentication should remain simple.

Do not implement:

* social login;
* OAuth providers;
* multi-factor authentication;
* enterprise identity providers;
* complex permission hierarchies;

unless explicitly requested later.

---

# Authorization

The backend must not rely only on frontend route protection.

Protected resources must also be validated server-side.

Conceptually:

```text
Client Request
      |
      v
Authentication Middleware
      |
      +---- Invalid token -> Unauthorized
      |
      v
Protected Resource
```

The initial system may use a single authenticated user role.

A role-based permission system is not required for the MVP.

---

# Authentication Persistence

The chosen implementation should provide a secure and practical way to maintain authenticated sessions.

Consider:

* token expiration;
* token storage;
* logout behavior;
* invalid token handling;
* refresh strategy if appropriate.

Avoid unnecessarily complex session infrastructure.

Security should take priority over convenience.

---

# User Model

The initial user model should remain minimal.

Possible fields:

```text
User
- id
- email or username
- passwordHash
- createdAt
- updatedAt
```

The exact schema should match the selected stack.

Do not add profile information unless it serves an actual requirement.

---

# Main User Experience

When opening SkyPulse, an unauthenticated user should first see the login interface.

After authentication, the user should access the main SkyPulse experience.

The user should eventually see an interactive 3D representation of Earth.

The globe should support:

* rotation;
* zoom;
* camera movement;
* geographic navigation;
* aircraft visualization.

Aircraft should appear at their approximate real-world geographic coordinates.

Each aircraft may have information such as:

* flight identifier;
* callsign;
* latitude;
* longitude;
* altitude;
* speed;
* heading;
* vertical rate;
* aircraft type;
* airline;
* origin airport;
* destination airport;
* flight status;
* last update timestamp.

Not every data provider will expose all of these fields.

The application must handle missing information gracefully.

---

# Flight Data

SkyPulse must obtain flight information from external aviation data sources.

A possible initial provider is **OpenSky Network**, but the architecture must not tightly couple the application to a single provider.

Other providers may be added or substituted later.

Examples include:

* OpenSky Network;
* AirLabs;
* aviationstack;
* ADS-B data providers;
* other compatible aviation APIs.

The provider should be treated as an external dependency.

---

# Provider Abstraction

Create a provider abstraction instead of exposing provider-specific data throughout the application.

Conceptually:

```text
External Aviation API
        |
        v
Flight Provider
        |
        v
Normalization Layer
        |
        v
Internal Flight Model
        |
        v
Application Services
        |
        v
Frontend
```

For example, the application may internally represent an aircraft using a model similar to:

```text
Flight
- id
- callsign
- latitude
- longitude
- altitude
- speed
- heading
- verticalRate
- onGround
- origin
- destination
- airline
- aircraft
- lastUpdated
```

The exact model should be determined during implementation.

The frontend should not need to know whether the information originated from OpenSky, AirLabs, or another provider.

---

# External API Protection

The frontend should preferably not communicate directly with external aviation APIs.

Prefer:

```text
Frontend
    |
    v
SkyPulse Backend
    |
    v
Flight Provider
    |
    v
External Aviation API
```

This allows SkyPulse to control:

* API credentials;
* rate limits;
* caching;
* normalization;
* provider changes;
* retries;
* errors;
* monitoring;
* data filtering.

Never expose private API credentials to the browser.

---

# Real-Time Architecture

Aircraft positions change continuously.

The architecture should eventually support near-real-time updates.

A possible flow is:

```text
Aviation Provider
        |
        v
SkyPulse Backend
        |
        v
Flight State / Cache
        |
        v
Real-Time Transport
        |
        v
Web Client
        |
        v
3D Globe
```

The exact transport mechanism should be selected based on the project architecture.

Possible approaches include:

* WebSockets;
* Server-Sent Events;
* efficient polling;
* hybrid approaches.

Do not introduce real-time infrastructure before it is necessary.

For the first implementation, a simple polling strategy may be acceptable if it helps validate the concept faster.

---

# Aircraft Movement

Aircraft should not visually teleport between API updates.

Suppose the provider reports:

```text
T0 -> Position A
T1 -> Position B
```

The client should eventually interpolate movement between those positions.

Conceptually:

```text
Position A
    |
    | smooth interpolation
    v
Position B
```

This should create the perception of continuous aircraft movement even when external data is updated only periodically.

Movement logic should consider:

* latitude;
* longitude;
* altitude;
* heading;
* update timestamp.

Do not implement complex prediction algorithms during the first milestone.

Simple interpolation is sufficient initially.

---

# 3D Globe

The main visual component of SkyPulse is the Earth.

Use an appropriate technology for interactive geospatial 3D visualization.

The globe should eventually support:

* Earth rendering;
* geographic coordinates;
* camera rotation;
* zoom;
* aircraft markers;
* heading orientation;
* altitude representation;
* route visualization;
* airport markers.

The selected solution must be able to handle a large number of visual entities efficiently.

---

# Aircraft Representation

Aircraft do not need highly detailed 3D models.

Performance is more important than visual complexity.

Depending on zoom level, aircraft may be represented differently.

Example:

```text
Global view
    ↓
small points / simplified icons

Regional view
    ↓
aircraft icons

Local view
    ↓
aircraft icon + callsign

Selected aircraft
    ↓
detailed flight information
```

This Level of Detail strategy should help maintain good performance.

---

# Geographic Filtering

SkyPulse may eventually display thousands of aircraft.

Avoid unnecessarily rendering or transmitting every aircraft when the user is inspecting a small region.

The architecture should support geographic filtering.

For example:

```text
Visible Globe Area
        |
        v
Bounding Box
        |
        v
Backend Query
        |
        v
Relevant Aircraft
```

A bounding box can be represented conceptually by:

```text
minimum latitude
maximum latitude
minimum longitude
maximum longitude
```

The system should eventually use the visible region and zoom level to determine how much data should be requested and rendered.

---

# Performance

Performance is a core requirement.

Potentially thousands of aircraft may exist simultaneously.

Avoid designs where every aircraft is represented by an expensive independent 3D object.

Consider techniques such as:

* batching;
* instancing;
* simplified geometry;
* Level of Detail;
* viewport filtering;
* geographic bounding boxes;
* client-side interpolation;
* efficient state updates;
* caching;
* throttling;
* debouncing.

Performance optimizations should be introduced when measurements show they are necessary.

Do not prematurely overengineer the MVP.

---

# Aircraft Interaction

Users should eventually be able to select an aircraft.

Selecting an aircraft should display available information.

Example:

```text
GLO1842

São Paulo -> Recife

Aircraft
Boeing 737-800

Altitude
35,000 ft

Ground Speed
820 km/h

Heading
34°

Status
En Route
```

The interface should clearly indicate when certain information is unavailable.

---

# Flight Routes

Future versions should support route visualization.

When a flight is selected, SkyPulse may display:

```text
Origin Airport
      |
      |-------------------- aircraft --------------------|
                                                        |
                                                 Destination
```

Routes may be represented as arcs following the curvature of the Earth.

Do not assume that a live aircraft position provider also provides origin and destination information.

Route information may require another provider or dataset.

---

# Airports

SkyPulse should eventually support airport information.

Possible airport features:

* airport markers;
* airport search;
* airport details;
* departures;
* arrivals;
* aircraft near an airport;
* airport codes;
* geographic location.

Airport data should be separated conceptually from live aircraft state.

---

# Search

Future versions should allow users to search for:

* flight number;
* callsign;
* aircraft;
* airport;
* airline.

Selecting a search result should move the camera toward the relevant aircraft or geographic location.

---

# Filters

Possible future filters include:

* airline;
* altitude;
* aircraft type;
* airport;
* country;
* airborne aircraft;
* aircraft on the ground;
* speed;
* flight status.

Filters should not be implemented until the core visualization is stable.

---

# Day and Night

A future visual feature should represent the real day/night cycle on Earth.

The globe may use the current date and time to determine which parts of the planet are illuminated by the Sun.

This should eventually allow SkyPulse to show:

* daylight;
* nighttime;
* sunrise regions;
* sunset regions.

This is a visual enhancement and is not required for the initial MVP.

---

# Weather

Weather integration is a possible future feature.

Possible information includes:

* clouds;
* precipitation;
* storms;
* wind;
* turbulence-related information;
* airport weather.

Weather is explicitly outside the initial scope.

---

# Caching

External aviation APIs may impose rate limits.

The backend should eventually maintain a short-lived cache of aircraft state.

Conceptually:

```text
External API
      |
      v
Backend Fetch
      |
      v
Flight Cache
      |
      +---- Client A
      |
      +---- Client B
      |
      +---- Client C
```

Multiple connected users should not cause identical external API requests whenever this can reasonably be avoided.

Choose the simplest caching solution appropriate for the current scale.

---

# Persistence

Because authentication requires persistent user credentials, the project should include persistent storage from the beginning.

The initial persistence layer should support at least:

* users;
* authentication-related data if required by the selected approach.

The database may later also support:

* historical flight paths;
* favorites;
* saved airports;
* saved flights;
* analytics;
* provider statistics;
* historical aircraft positions.

Do not store live aircraft positions permanently unless there is a concrete requirement.

---

# Docker

The entire SkyPulse development environment must be containerized with Docker.

A developer should be able to clone the repository, configure environment variables, and start the complete system using Docker.

The project should provide:

* Dockerfiles for application services;
* Docker Compose configuration;
* persistent volumes where necessary;
* environment variable configuration;
* health checks where useful;
* clear development startup instructions.

A typical architecture may eventually look like:

```text
Docker Compose
|
+-- web
|
+-- server
|
+-- database
|
+-- cache (only if required)
```

Do not add services merely because they may be useful later.

For example, do not introduce Redis until caching or real-time architecture actually requires it.

---

# Docker Development Experience

The project should prioritize a simple local development workflow.

The preferred experience is conceptually:

```bash
docker compose up
```

or:

```bash
docker compose up --build
```

After startup, all required services should be available locally.

Avoid requiring developers to manually install database servers or backend dependencies on the host machine.

Only Docker and the required Docker tooling should be necessary for the full containerized workflow.

---

# Docker Images

Use appropriate multi-stage builds where useful.

Keep images reasonably small.

Do not place secrets inside images.

Development and production requirements may differ.

If separate Docker configurations are necessary, keep them easy to understand and clearly documented.

---

# Database

The database technology should be selected by the implementation agent according to the chosen backend stack and authentication requirements.

The database must run as a Docker service during local development.

Schema migrations should be reproducible and version controlled.

The application should not depend on manually modifying the database.

---

# Environment Variables

Use environment variables for configuration.

Examples may include:

```text
DATABASE_URL
AUTH_SECRET
AVIATION_API_KEY
AVIATION_API_BASE_URL
```

The exact names should match the selected implementation.

Provide an example environment file such as:

```text
.env.example
```

Never commit real credentials.

---

# Error Handling

External aviation services may:

* become unavailable;
* return incomplete data;
* enforce rate limits;
* respond slowly;
* return stale aircraft positions.

SkyPulse should fail gracefully.

The UI should distinguish between:

* no aircraft found;
* provider unavailable;
* rate limited;
* stale data;
* network error;
* authentication expired;
* unauthorized access.

Do not crash the entire application because an external provider failed.

---

# Visual Direction

SkyPulse should feel like a modern global monitoring platform.

The visual identity should prioritize:

* dark interface;
* Earth as the primary visual element;
* minimal UI;
* high information density without clutter;
* subtle aviation-inspired elements;
* smooth transitions;
* professional typography;
* clear information hierarchy.

Avoid creating a visual clone of existing flight tracking platforms.

SkyPulse must have its own visual identity.

The globe should dominate the screen.

UI panels should appear around or over the globe only when necessary.

The login page should follow the same visual identity.

---

# Responsive Design

The initial focus should be desktop web.

However, architecture and UI decisions should avoid unnecessarily preventing future support for:

* tablets;
* mobile browsers.

Mobile optimization is not required for the first milestone.

---

# Suggested Development Phases

## Phase 1 — Foundation and Docker

Goal:

Create the basic project architecture and make the complete environment runnable through Docker.

Tasks should include:

* inspect repository;
* choose appropriate stack;
* create frontend;
* create backend;
* configure database;
* create Dockerfiles;
* create Docker Compose configuration;
* configure environment variables;
* configure schema migrations;
* establish code quality conventions;
* document how to start the project.

Expected result:

```bash
docker compose up --build
```

starts the initial SkyPulse environment.

---

## Phase 2 — Authentication

Goal:

Create the basic access control system.

Requirements:

* user persistence;
* secure password hashing;
* login endpoint;
* token generation;
* authentication middleware;
* protected application route;
* frontend login page;
* authenticated frontend state;
* logout;
* token expiration handling.

Registration does not need to be publicly available unless the chosen development workflow benefits from it.

A development seed user or simple user creation mechanism is acceptable.

---

## Phase 3 — Earth

Goal:

Display an interactive 3D globe after authentication.

Requirements:

* protected SkyPulse page;
* Earth visible;
* rotate camera;
* zoom;
* basic geographic navigation;
* responsive viewport.

At this stage, no real aircraft data is required.

---

## Phase 4 — Live Aircraft

Goal:

Connect to an aviation data provider.

Requirements:

* backend provider integration;
* normalize provider data;
* obtain aircraft coordinates;
* display aircraft on the globe;
* handle missing data;
* respect provider rate limits.

Initially, it is acceptable to restrict data to a geographic region.

---

## Phase 5 — Aircraft Interaction

Goal:

Allow aircraft inspection.

Requirements:

* aircraft selection;
* callsign;
* altitude;
* speed;
* heading;
* available flight metadata;
* selected-aircraft visual state.

---

## Phase 6 — Smooth Movement

Goal:

Improve the real-time experience.

Requirements:

* periodic position updates;
* client-side interpolation;
* heading updates;
* smooth movement;
* removal of stale aircraft.

---

## Phase 7 — Geographic Scaling

Goal:

Support progressively larger areas.

Requirements:

* bounding-box queries;
* viewport-aware data;
* Level of Detail;
* performance profiling;
* efficient aircraft rendering.

Progress toward worldwide visualization only after regional performance is validated.

---

## Phase 8 — Flight Intelligence

Possible additions:

* origin;
* destination;
* airlines;
* aircraft information;
* route arcs;
* airports;
* flight search.

These features may require additional data providers.

---

## Phase 9 — Advanced Platform

Possible future features:

* worldwide live visualization;
* airport dashboards;
* advanced filters;
* flight history;
* aircraft trails;
* weather;
* day/night visualization;
* favorites;
* user profiles;
* historical analytics.

---

# Initial MVP

The first useful MVP should include:

> Start SkyPulse through Docker, authenticate with a valid user, access the protected application, see an interactive 3D Earth, load real aircraft data for a selected region, see aircraft positioned on the globe, and click an aircraft to inspect basic live information.

The MVP does NOT need:

* social authentication;
* complex user permissions;
* historical flight tracking;
* weather;
* worldwide high-frequency updates;
* complex route prediction;
* detailed aircraft models;
* mobile application;
* advanced search.

---

# First Target Region

For development and testing, prefer a limited geographic region instead of immediately loading worldwide traffic.

A reasonable first test region could be **Brazil or South America**.

The region should be configurable rather than hardcoded deeply into the application.

Once the architecture and performance are validated, expand toward global coverage.

---

# Code Quality

Prefer:

* simple code;
* small modules;
* explicit responsibilities;
* strong typing where supported;
* clear naming;
* reusable components;
* provider abstractions;
* testable business logic;
* documented environment variables;
* reproducible Docker environments.

Avoid:

* unnecessary abstractions;
* premature microservices;
* premature distributed infrastructure;
* huge components;
* duplicated provider logic;
* provider-specific models leaking throughout the application;
* secrets committed to the repository;
* host-machine-specific setup.

---

# Security

Never commit API keys, passwords, tokens, or secrets.

Use environment variables for secrets.

Provide example environment configuration without real credentials.

Passwords must be hashed securely.

Authentication must be validated server-side.

Protected endpoints must reject missing, invalid, or expired credentials.

Validate any user-controlled parameters sent to backend services.

Do not allow the frontend to arbitrarily proxy requests to external APIs.

Do not expose database ports publicly unless required for local development.

---

# Documentation

Maintain a useful README.

At minimum it should eventually explain:

* what SkyPulse is;
* architecture;
* selected technologies;
* prerequisites;
* Docker setup;
* development commands;
* environment variables;
* authentication flow;
* database migrations;
* external providers;
* known limitations.

Important architectural decisions should be documented when they are introduced.

---

# Development Philosophy

Build SkyPulse incrementally.

Do not attempt to implement the entire vision at once.

Each milestone should leave the project in a working state.

Prefer:

```text
small working feature
        ↓
validate
        ↓
commit
        ↓
next feature
```

over:

```text
large architecture
        ↓
many unfinished systems
        ↓
difficult debugging
```

The first objective is not to build a complete flight tracking platform.

The first objective is to establish a reliable foundation:

```text
Docker Environment
        +
Authentication
        +
Interactive 3D Earth
        +
Real Flight Data
        +
Correct Aircraft Position
```

Once this works reliably, evolve the project toward the complete SkyPulse vision.

---

# Instructions for the Coding Agent

Before writing code:

1. Read this entire document.
2. Inspect the repository.
3. Determine whether an existing architecture exists.
4. Select or adapt the technology stack appropriately.
5. Ensure the selected stack works cleanly with Docker.
6. Do not implement all phases at once.
7. Start with **Phase 1 — Foundation and Docker**.
8. The complete initial environment must run through Docker.
9. Then proceed to **Phase 2 — Authentication**.
10. Keep the application runnable after each meaningful change.
11. Document important technical decisions.
12. Keep everything persisted in the repository in English.

If the repository is empty, initialize SkyPulse with a clean, maintainable structure suitable for the requirements above.

When there are multiple reasonable technical approaches, prefer the simplest solution that satisfies the current phase while preserving a clear path toward the next phases.

Do not overengineer hypothetical future requirements.

The long-term destination is ambitious.

The first implementation should be small, understandable, secure, containerized, and working.
