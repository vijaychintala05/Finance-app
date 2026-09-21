# FirmBooks — Project Guidance & Configuration

## Overview
FirmBooks is a self-hosted, double-entry financial accounting and enterprise bookkeeping web application built with React, TypeScript, Node.js (Express), and PostgreSQL.

## Commands
- **Lint & Type Check**: `npm run lint` (`tsc --noEmit -p tsconfig.build.json`)
- **Run Tests**: `npm test` (`vitest run --configLoader native`)
- **Build**: `npm run build` (`vite build --configLoader native && node scripts/build-server.mjs`)
- **Development**: `npm run dev` (`tsx server.ts`)

---

## Deploy Configuration (configured by /setup-deploy)
- Platform: GitHub Actions / GHCR Container (`ghcr.io/vijaychintala05/finance-app`)
- Production URL: http://nas.local:3000
- Deploy workflow: .github/workflows/publish-container.yaml
- Deploy status command: gh run list --workflow=publish-container.yaml --limit 1
- Merge method: ff-only
- Project type: web app / API
- Post-deploy health check: http://nas.local:3000/api/readyz

### Custom deploy hooks
- Pre-merge: npm run lint && npm test && npm run build
- Deploy trigger: git push origin main && git push origin nas-deploy
- Deploy status: gh run list --workflow=publish-container.yaml --limit 1
- Health check: curl -sf http://nas.local:3000/api/readyz

---

## END-TO-END FEATURE IMPLEMENTATION RULE

For every feature, change, screen, widget, dashboard, report, form, table, chart, or workflow requested:

You must implement it as a COMPLETE production feature, not just as UI.

### Required Chain:
**UI → state/query layer → API/server action → business logic → database → API response → UI refresh**

A feature is **not complete** if any link is mocked, hard-coded, or only stored in browser state.

### 1. Inspect before coding
Inspect database schema, backend/API architecture, auth, tenant isolation, permissions, repositories, state management, and existing endpoints before coding.

### 2. Trace the complete data flow
USER ACTION → FRONTEND COMPONENT → QUERY/STATE LAYER → API/SERVER ACTION → BUSINESS LOGIC → DATABASE → API RESPONSE → FRONTEND REFRESH. If any layer is missing, implement it.

### 3. Never use fake data unless explicitly requested
No hardcoded numbers, chart values, fake arrays, or browser-only financial calculations. Production screens must use real database-backed data.

### 4. Backend is mandatory
Create or modify required database tables, columns, migrations, server services, API endpoints, validations, and authorization. Never stop at the frontend.

### 5. Database must remain the source of truth
All mutations must validate input, check auth, enforce tenant isolation, write to the database, return the saved record, and refresh frontend state. Changes must survive page refresh, logout/login, and multi-device access.

### 6. Real-time / current data representation
Cards, tables, balances, counts, and reports must always represent actual backend data via proper query invalidation/refetch.

### 7. No duplicate business logic
Business-critical financial calculations (balances, revenues, expenses, tax, payment allocations) must live in the authoritative backend/domain layer.

### 8. Existing architecture first
Reuse and extend existing API patterns, services, hooks, and schemas rather than introducing parallel architecture.

### 9. Handle all feature states
Loading, empty, success, validation errors, server errors, unauthorized, network failure, and retry.

### 10. Test the complete vertical slice
Verify CREATE (UI→API→DB→UI), READ (DB→API→UI), UPDATE (UI→API→DB→UI), DELETE (UI→API→DB→UI), and refresh persistence.

### 11. Before declaring DONE
Provide an implementation audit:
- Frontend: What changed
- Backend: What changed
- Database: What changed
- API: Endpoints used/created/modified
- Data source: Where each displayed value comes from
- Realtime/refetch: How UI receives updated information
- Permissions: Authorization checks performed
- Tests: Tests added/run and results
- Remaining mocks/placeholders: List every one. If none, explicitly state **NONE**.

### Definition of Done
A feature is **NOT DONE** merely because it looks correct.
A feature is **DONE** only when:
- UI is complete
- Backend is complete
- Database integration is complete
- Real data is displayed
- CRUD operations persist
- Refresh shows the same saved state
- Permissions are enforced
- Tenant isolation is preserved
- Errors are handled
- Relevant tests pass
- No unintended mocks or hard-coded production values remain

