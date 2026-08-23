# Deferred Roadmap

These items were intentionally excluded from the Point-1 workflow-certification program.

## Jurisdiction Tax Filing

- **What:** Add jurisdiction-specific filing reports, returns, validation, and submission workflows.
- **Why deferred:** Requires country-specific accountant/legal validation beyond the current trusted ledger scope.
- **Context:** Point 1 preserves tax integrity but does not claim statutory filing support.
- **Effort:** XL
- **Priority:** P2 after Point 1 certification

## Payment Gateways and Portals

- **What:** Add payment collection, customer portal, and vendor portal experiences.
- **Why deferred:** Introduces external money movement, identity, webhook, dispute, and reconciliation surfaces.
- **Context:** Current Point 1 focuses on internal books operations.
- **Effort:** XL
- **Priority:** P2

## Inventory and Payroll

- **What:** Add inventory valuation/order fulfillment and payroll accounting.
- **Why deferred:** Each is a separate accounting product domain with material schema and compliance impact.
- **Context:** Neither is required to certify the existing AR/AP, recurring, asset, close, recovery, or access workflows.
- **Effort:** XL+
- **Priority:** P3

## Historical AR/AP Reconstruction

- **What:** Reconstruct point-in-time receivable and payable aging from historical source events.
- **Why deferred:** Current reports are certified for current open balances; historical reconstruction needs separate event-history guarantees.
- **Context:** Do not market historical aging until independently certified.
- **Effort:** L
- **Priority:** P2

## Public Integration API

- **What:** Publish versioned external API contracts, webhooks, SDK examples, and compatibility guarantees.
- **Why deferred:** Point 1 targets the internal application and canonical service ownership first.
- **Context:** Internal REST endpoints remain implementation surfaces, not a promised public platform.
- **Effort:** L
- **Priority:** P3

## Docker Development Environment

- **What:** Add an optional Docker Compose development environment.
- **Why deferred:** Native PostgreSQL scripts match the current Windows workspace and avoid adding a new runtime prerequisite.
- **Context:** Revisit after the native bootstrap and TTHW are measured.
- **Effort:** S
- **Priority:** P3

## AI Features

- **What:** Add AI-assisted categorization, anomaly detection, or accounting explanations.
- **Why deferred:** Trustworthy source workflows, evidence, and recovery must be complete before probabilistic assistance is introduced.
- **Context:** AI may advise later but must never bypass accounting controls.
- **Effort:** L
- **Priority:** P3
