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
