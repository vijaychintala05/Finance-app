# Health Audit Remediation Plan (Autoplan)

## Problem Statement
The comprehensive codebase audit confirmed that core accounting invariants, database safety, and type checking are healthy (97 test suites passed, 878 tests passed, 0 failures, 0 lint errors). However, three specific categories of issues require remediation:
1. **P1: Feature Flag Quarantine**: `'accountant-overview'` and `'delivery-challans'` are guarded by `requireTrustedFinanceFeature` in `finance.routes.ts` but are omitted from `CERTIFIED_OPTIONAL_FEATURES` in `server/src/middleware/trustedFeature.middleware.ts`, causing them to return hard HTTP 503 errors.
2. **P2: Production Error Sanitization**: Multiple HTTP 500 handlers in `server/src/routes/identity.routes.ts` and `server/src/controllers/bankingController.ts` return raw `err.message` strings directly to clients, potentially leaking internal database exceptions in production.
3. **P3: Dead / Superseded UI Code**: 11 unreferenced components in `src/components/` (historical views replaced by unified `SettlementWorkspace` and `RecurringTransactionsView`) add cognitive overhead.

---

## The 6 Decision Principles Applied

1. **Choose completeness**: Address all three actionable tiers (P1 feature flags, P2 error sanitization, P3 dead code pruning) completely with verification.
2. **Boil lakes**: Keep changes scoped strictly to the blast radius of the flagged endpoints and components without modifying financial ledger calculations.
3. **Pragmatic**: Clean 1-line registrations and a standardized error sanitizer rather than heavyweight new abstractions.
4. **DRY**: Eliminate duplicate, superseded legacy views that mirror logic now residing in `SettlementWorkspace` and `RecurringTransactionsView`.
5. **Explicit over clever**: Use explicit `NODE_ENV === 'production'` conditional checks for error sanitization.
6. **Bias toward action**: Clean and harden immediately with zero regression risk.

---

## Proposed Changes

### 1. P1: Certify Missing Feature Flags
#### [server/src/middleware/trustedFeature.middleware.ts](file:///c:/Users/HI/Desktop/APP/finance%20app/server/src/middleware/trustedFeature.middleware.ts)
- Add `'accountant-overview'` and `'delivery-challans'` to `CERTIFIED_OPTIONAL_FEATURES`.
- This allows environments to enable these workflows cleanly via `TRUSTED_FINANCE_FEATURES` (or automatically in development/testing mode).

### 2. P2: Production Error Sanitization
#### [server/src/routes/identity.routes.ts](file:///c:/Users/HI/Desktop/APP/finance%20app/server/src/routes/identity.routes.ts) & [server/src/controllers/bankingController.ts](file:///c:/Users/HI/Desktop/APP/finance%20app/server/src/controllers/bankingController.ts)
- Sanitize error payloads on 500 status codes: return `"Internal server error"` or safe domain errors in production (`process.env.NODE_ENV === 'production'`) while logging the true error server-side.

### 3. P3: Remove Superseded Dead Code (11 Files)
- Remove orphaned, unimported legacy components:
  - `src/components/purchases/PaymentsMadeView.tsx` (superseded by `SettlementWorkspace.tsx`)
  - `src/components/purchases/VendorCreditsView.tsx` (superseded by `SettlementWorkspace.tsx`)
  - `src/components/sales/CreditNotesView.tsx` (superseded by `SettlementWorkspace.tsx`)
  - `src/components/purchases/RecurringBillsView.tsx` (superseded by `RecurringTransactionsView.tsx`)
  - `src/components/purchases/RecurringExpensesView.tsx` (superseded by `RecurringTransactionsView.tsx`)
  - `src/components/sales/RecurringInvoicesView.tsx` (superseded by `RecurringTransactionsView.tsx`)
  - `src/components/items/MasterItemsView.tsx` (unreferenced)
  - `src/components/clients/ClientDetailsModal.tsx` (unreferenced)
  - `src/components/dashboard/widgets/DashboardQuickActions.tsx` (unreferenced)
  - `src/components/settings/ActiveSessionsSettings.tsx` (unreferenced)
  - `src/components/settings/AutomationSettings.tsx` (unreferenced)

---

## Verification Plan

### Automated Verification
1. `npm.cmd run lint` — verify zero TypeScript or lint errors.
2. `npm.cmd run build` — verify client and server production bundles compile without warnings.
3. `npx.cmd vitest run` — verify all 97 test suites and 878 tests continue passing with 100% success rate.
