# FirmBooks Deployment Readiness: Reviewed Implementation Plan

## Release Contract

A release is deployable only when all gates pass against the same commit:

```text
Type check -> unit/integration tests -> production build -> Docker build
  -> container starts with PostgreSQL -> /api/healthz + /api/readyz pass
  -> publish immutable image tag -> NAS smoke test -> promote
```

The current branch does not meet this contract. The frontend build fails on stale imports,
the type check reports drift across settings and tests, and the Dockerfile tries to execute a
server bundle that the current build does not create.

## What Already Exists

| Capability | Existing component | Reuse decision |
|---|---|---|
| Frontend production build | Vite `npm run build` | Keep Vite; make server bundling an explicit second build step. |
| API entrypoint | `server.ts` and `server/src/index.ts` | Bundle the existing entrypoint rather than changing runtime architecture. |
| Container release | `Dockerfile`, GitHub container workflow | Repair and hard-gate the existing pipeline. |
| Runtime health probes | `/api/healthz`, `/api/readyz` | Use them for container and NAS smoke verification. |
| Test infrastructure | Vitest, Playwright, 96 test files | Keep tests; make CI report and gate their result. |
| NAS release route | existing GHCR image and NAS compose setup | Publish only an immutable, verified tag. |

## CEO Review

### Premise And Scope

The user confirmed the complete release gate, not a cosmetic build-only fix. The goal is not
to make the UI compile once. The goal is to ensure that the image sent to the NAS is the
same application that was compiled, tested, started, and health-checked in CI.

### Not In Scope

- New accounting features, dashboard redesign, GST expansion, or auth redesign.
- Database data migration beyond testing the existing migration boot path.
- Internet exposure, reverse proxy, Tailscale, backups, or NAS hardware changes.
- Refactoring unrelated financial engines while restoring release health.

### Failure And Rescue Registry

| Failure | Prevention | Rescue |
|---|---|---|
| Stale frontend import breaks build | Type check and Vite build required in CI | Block publish and show exact failing import. |
| Image has no runnable server | Assert `dist/server.cjs` exists and start image in CI | Fail image smoke test before push. |
| Tests pass only in memory but PostgreSQL boot fails | Start disposable PostgreSQL for image readiness test | Block promotion; retain logs and image digest. |
| `latest` points to a bad image | Publish immutable SHA tag before moving `latest` | NAS stays pinned to last known-good tag. |
| NAS update starts but cannot serve requests | Probe health/readiness after pull and before promotion | Roll back compose image tag to prior verified digest. |

## Design Review

This work has little user-facing UI scope. The only user-visible behavior is better failure
feedback for operators: build logs must identify the failed gate, and readiness endpoints
must return an actionable reason rather than a blank failure. No application-layout changes
are required.

## Engineering Plan

### 1. Repair Compile Contracts

1. Resolve the `api` versus `apiClient` mismatch in the Settings modules by choosing one
   canonical API client export and updating every caller.
2. Export `PermissionCode` from its intended public module, or import it directly from the
   permission registry. Do not rely on an accidental private type import.
3. Reconcile stale test fixtures and service call signatures to their current domain models:
   GST customer fields, HSN/SAC discriminated item types, credit note results, sales order
   naming, advance application dates, report arguments, and missing role service imports.
4. Keep strict TypeScript enabled. Do not exclude tests or settings files from `tsconfig`.

### 2. Produce A Real Server Artifact

Add an explicit server bundle script, for example `scripts/build-server.mjs`, using esbuild
to bundle `server.ts` for Node 22 into `dist/server.cjs`. The `build` script must run:

```text
vite build --configLoader native && node scripts/build-server.mjs
```

The build script must fail if the output artifact is missing. The Dockerfile must copy the
frontend assets and the bundled server, then execute only that generated server artifact.

### 3. Make Docker Testable And Correct

1. Preserve the multi-stage Docker build, but run the repaired combined build in the build
   stage and copy the complete `dist` directory to runtime.
2. Ensure runtime dependencies are sufficient for the bundle. Do not require `tsx`, source
   TypeScript, or dev dependencies in the runtime image.
3. Run the image locally/CI with a disposable PostgreSQL service and production-like required
   variables: `DATABASE_URL`, a 32+ character `JWT_SECRET`, `NODE_ENV=production`, allowed
   origin, and port.
4. Verify `GET /api/healthz` returns 200 and `/api/readyz` returns 200 only after migrations
   have completed. Verify that missing database configuration fails closed.

### 4. Add CI Release Gates

Update `.github/workflows/publish-container.yaml` in this exact order:

```text
npm ci
-> npm run lint
-> npm test
-> npm run build
-> Docker build
-> start Docker + PostgreSQL
-> /api/healthz and /api/readyz smoke test
-> publish SHA tag
-> publish latest only after all previous steps pass
```

Use GitHub Actions service containers or a dedicated Docker Compose test fixture. Upload test
and container logs on failure. The workflow must never push `latest` when any gate fails.

### 5. NAS Promotion And Rollback

1. Change the NAS compose configuration to reference the immutable `ghcr.io/...:<git-sha>`
   image tag for a release, not only `latest`.
2. Record the prior image tag before updating.
3. After deploy, probe the NAS at `/api/healthz` and `/api/readyz`, then perform one
   authenticated smoke operation against a non-production test organization.
4. On any failed probe, return the compose file to the recorded tag and redeploy.
5. Only after a successful smoke test may the release be considered promoted.

### Architecture Diagram

```text
source + lockfile
     |
     +--> tsc --noEmit -------------------+ 
     +--> vitest + Playwright ------------+--> CI release gate
     +--> Vite frontend build             |       |
     +--> esbuild server.ts -> server.cjs +       v
                                             Docker image (immutable SHA tag)
                                                       |
                                             PostgreSQL boot + migrations
                                                       |
                                               healthz + readyz smoke
                                                       |
                                             GHCR publish -> NAS pull/probe
                                                       |
                                                 promote or roll back
```

### Test Diagram

```text
COMPILE / BUILD
  package scripts -> [GAP] lint currently fails
  Vite settings module import -> [GAP] build currently fails
  server bundle output -> [GAP] artifact not produced

CONTAINER
  docker build -> [GAP] runtime expects dist/server.cjs
  production startup with PostgreSQL -> [GAP] no CI proof
  missing DATABASE_URL -> [EXISTING] production fail-closed behavior
  healthz / readyz -> [GAP] no image-level smoke test

ACCOUNTING REGRESSION
  atomicity/concurrency -> [TESTED] focused suite: 31 passing
  payment lifecycle browser flow -> [TESTED] Chromium desktop flow passed
  full Vitest suite -> [UNKNOWN] runner did not complete during review
```

### Required Tests

1. `npm run lint` must pass with no exclusions.
2. Full `npm test` must report a final all-green summary.
3. `npm run build` must create both Vite assets and `dist/server.cjs`.
4. Docker smoke test must assert the server file exists, the container stays running, and
   health/readiness pass against PostgreSQL.
5. Negative Docker test must assert production startup fails without `DATABASE_URL` or with a
   short `JWT_SECRET`.
6. Run the existing accounting atomicity, project accounting, and payment-allocation E2E tests
   as explicit high-risk regression gates.
7. NAS smoke test must confirm the exact immutable image tag served the app and migrations are
   ready before promotion.

## Performance And Operations

- Keep CI stages separate so a TypeScript error fails in seconds rather than after a Docker
  push attempt.
- Avoid a new orchestration product. GitHub Actions, Docker, health endpoints, and PostgreSQL
  service containers are sufficient Layer 1 tools.
- Preserve logs and image digest for every attempt; failures must be diagnosable without SSH.
- The NAS should pull a verified digest, not rebuild application code.

## Parallelization

| Workstream | Modules | Depends on |
|---|---|---|
| A: compile drift | settings/, auth/, test fixtures | — |
| B: server artifact | package scripts, build tooling, Dockerfile | — |
| C: CI gates | GitHub workflow, test compose fixture | A and B |
| D: NAS promotion checks | NAS compose/docs | C |

Launch A and B in parallel. Merge both before C. Run D only after CI succeeds. A and B both
touch package/build configuration only lightly; coordinate package script edits to avoid a
merge conflict.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — Compile contracts — restore all TypeScript
  imports, exports, fixtures, and service signatures until strict type checking passes.
  - Verify: `npm run lint`
- [ ] **T2 (P1, human: ~1h / CC: ~15min)** — Server distribution — add and verify an explicit
  Node server bundle so `dist/server.cjs` exists for production runtime.
  - Verify: `npm run build` and `node dist/server.cjs` with production environment.
- [ ] **T3 (P1, human: ~1h / CC: ~15min)** — Docker runtime — repair the multi-stage image and
  add container startup plus health/readiness checks against PostgreSQL.
  - Verify: Docker build and disposable PostgreSQL smoke test.
- [ ] **T4 (P1, human: ~1h / CC: ~15min)** — CI release gate — run lint, full tests, build,
  Docker smoke, and only then publish immutable and latest image tags.
  - Verify: GitHub Actions run from a clean commit.
- [ ] **T5 (P2, human: ~45min / CC: ~10min)** — NAS promotion — pin a verified SHA tag, capture
  prior version, probe health/readiness, and document rollback.
  - Verify: NAS staged deploy and rollback drill.

## Decision Audit Trail

| # | Decision | Classification | Rationale |
|---|---|---|---|
| 1 | Full release gate rather than build-only repair | User-confirmed | The NAS must only receive a tested runnable image. |
| 2 | Bundle existing server entrypoint | Mechanical | Fixes distribution without changing business architecture. |
| 3 | CI publishes SHA before latest | Mechanical | Makes rollback deterministic and prevents latest from becoming an unsafe pointer. |
| 4 | Docker smoke uses PostgreSQL and readiness | Mechanical | The app is database-authoritative, so a static frontend check is insufficient. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | `/plan-eng-review` | Architecture and test health | 1 | OPEN | 3 release blockers: type check, build, server artifact |
| CEO Review | `/autoplan` | Scope and deployment contract | 1 | CLEAR | Full release gate confirmed |
| Design Review | `/autoplan` | UI impact | 1 | CLEAR | No material UI work required |
| DX Review | `/autoplan` | Operator/build experience | 1 | OPEN | CI failure diagnostics and release gates required |

**VERDICT:** Not deploy-ready. Implement T1-T4, pass all release gates, then perform T5.
NO UNRESOLVED DECISIONS
