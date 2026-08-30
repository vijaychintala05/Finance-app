# Role-Adaptive Accounting Dashboard Plan

## Outcome

Replace the current generic financial snapshot with a decision-oriented dashboard
that gives each authorized user the right next financial action:

- **Business owner:** liquidity, collections, bills due, and current-period performance.
- **Cash operations:** bank-reconciliation work, money due in, money due out, and only
  capability-certified cash forecasting.
- **Accountant/controller:** close readiness, integrity exceptions, AR/AP controls, and
  direct evidence links to reports and source workspaces.

This is not a chart-builder in the first release. It is a trustworthy home screen that
turns existing ledger-backed data into prioritized action.

## Research And Product Decisions

Zoho's home view makes receivables, bank balance, income/expense, and cash movement
drill into their respective detailed reports. Its custom dashboards also demonstrate
that personal layout and permission-aware panels are useful once a product has a stable
panel catalog. [Zoho Books Home](https://www.zoho.com/ca/books/help/home/)
[Zoho Custom Dashboards](https://www.zoho.com/us/books/help/home/custom-dashboards.html)

Xero concentrates daily work around balances, invoices owed, bills due, and bank status;
its sales overview emphasizes high-value and overdue work rather than undifferentiated
totals. [Xero Dashboard](https://www.xero.com/ae/accounting-software/dashboard/)
[Xero Sales Overview](https://central.xero.com/0/article/Sales-dashboard)

QuickBooks separates reusable dashboards such as profitability, cash flow, AR, and AP,
and supports transaction-level drill-down. [QuickBooks Dashboards](https://quickbooks.intuit.com/learn-support/en-us/help-article/business-reports/create-dashboards-view-key-business-insights/L7C4Ftrzx_US_en_US)

**Adopt now:** role-oriented views, explicit period/as-of context, urgent work queues,
bank and AR/AP drill-down, and permission-aware availability.

**Defer:** arbitrary visual builders, saved layouts, peer benchmarking, and tax/profit
metrics that cannot yet be proven from the configured chart of accounts and capabilities.

## Current-State Findings

`DashboardSummaryService` already provides tenant-scoped receivables, payables, bank/cash,
monthly revenue, outstanding counts, reconciliation attention, quotations, and recent
documents. The UI correctly hides totals on an API failure.

The present screen has four issues to address:

1. It does not answer "what should I do next?" or rank work by urgency/value.
2. It has one view for owners, cash operators, and accountants despite distinct jobs.
3. Its card navigation loses the context that caused the user to click.
4. `AccountantOverviewService` is not a suitable direct dependency: it hard-codes an
   accounting period and uses generic `Number` conversion for money. Its useful integrity
   concepts must be rebuilt with the existing exact-money helpers and server-calculated
   date context.

## V1 Experience

### Shared Dashboard Shell

- Header: `Overview`, `Cash operations`, and conditionally visible `Close & controls`
  tabs; a server-validated date/as-of selector; refresh; generated-at timestamp; and a
  verified-reports command.
- The active view may be remembered only as a non-financial user preference. It must
  never grant access or cause unavailable financial data to be returned.
- Every monetary value states its basis in compact supporting text: posted ledger,
  invoice/bill subledger, or forecast. Values never come from browser arithmetic.
- Every alert/card is a link to a concrete filtered workspace or authoritative report.
  The destination recalculates its own data server-side; dashboard totals are not passed
  as trusted navigation state.
- Mobile uses a single-column priority queue followed by expandable metric rows. Desktop
  uses a dense two-column action/data layout. No nested decorative cards or chart-only
  controls.

### Overview (Default)

1. **Cash and bank:** posted bank/cash balance, per-account review count, and a direct
   reconciliation action when permitted.
2. **Get paid:** total open AR, overdue amount/count, and up to five ranked customer
   follow-ups (overdue first, then highest balance). Each item opens the filtered invoice
   workspace or AR aging report.
3. **Pay deliberately:** total AP, bills due in 7 days, overdue bills, and a link to the
   bills workspace/AP aging report.
4. **Current-period activity:** posted income and expense, with an explicit selected
   period and drill-through to the P&L. Do not label this "profit" unless the P&L report
   is the underlying authoritative calculation.
5. **Attention queue:** unreconciled bank entries, quotation responses, draft/submitted
   journals where the viewer has permission, and a zero-state that names the next setup
   action instead of showing an empty chart.

### Cash Operations

1. Reconciliation queue by bank account with unmatched count and oldest statement date.
2. Expected collections and bills due in 7/30 days, explicitly described as due documents
   rather than cash forecast.
3. Optional 7/30-day cash forecast only when `cash-flow-forecasting` is both enabled and
   trusted. It must use the existing server endpoint, label assumptions, distinguish
   actuals from forecast, and have a disabled/unavailable state otherwise.
4. Recent settlement/reconciliation activity with links to the source document.

### Close And Controls

Visible only when the authenticated user has the relevant reporting, accounting, and audit
permissions. It contains:

1. Period-close state and blocking/warning counts from `PeriodCloseService` validation.
2. Trial-balance/integrity status and AR/AP reconciliation differences from authoritative
   integrity/report services, never duplicated hand-written dashboard SQL.
3. Unreconciled bank count and unposted journal count with direct source actions.
4. Latest close/reopen audit evidence and a direct period-close workspace link.

## Delivery Plan

### Phase 0: Contract And Truth Rules

Files: `server/src/services/DashboardSummaryService.ts`,
`server/src/controllers/Phase8Controller.ts`, `server/src/routes/phase8.routes.ts`,
new dashboard DTO/type files, and focused server tests.

1. Replace the flat summary DTO with a versioned `DashboardResponse`:
   `view`, `asOfDate`, `generatedAt`, `currency`, `capabilities`, `permissions`,
   `widgets`, and `attentionItems`.
2. Validate `view` and date-range inputs on the server. Use organization-local business
   date rules already used by reports; reject invalid ranges instead of silently changing
   them.
3. Split query responsibilities into small, testable widget builders. Reuse AR/AP aging,
   P&L, cash-flow, banking, and period-close services where an authoritative service
   exists; retain ledger SQL only for clearly owned aggregate widgets.
4. Standardize exact money conversion through `databaseMoney`/cent helpers. Never return
   JavaScript floats produced by unchecked `Number` conversion.
5. Keep `GET /dashboard-summary` as a compatibility adapter during the UI migration, then
   remove it only after all callers use `GET /dashboard?view=...`.

### Phase 1: Owner Overview

Files: `src/components/dashboard/DashboardView.tsx`, new focused dashboard components,
navigation types/routing in `src/App.tsx`, client API types, and UI tests.

1. Implement the shared shell, period selector, freshness state, loading skeletons, and
   failure state that hides affected financial values.
2. Implement the four owner sections and ranked attention queue.
3. Add explicit drill-through route parameters for overdue invoices, due bills, and
   reconciliation work. Parse and validate them in `App.tsx`; destination views fetch
   their data anew.
4. Replace the gradient quick-action tile with a restrained command area using lucide
   icons and existing modals/actions.

### Phase 2: Cash Operations

1. Add bank-account reconciliation and due-document widgets backed by server aggregates.
2. Gate forecast rendering on server-reported capability plus route authorization.
3. Treat disabled capability, incomplete setup, no data, and API failure as distinct UI
   states. No browser-generated forecast fallback.

### Phase 3: Close And Controls

1. Rework `AccountantOverviewService` into exact-money, date-aware control widgets or
   retire it in favor of existing integrity/period-close report services.
2. Add permission-aware controller view and audit-evidence links.
3. Do not expose accounting/audit controls merely because a user selected a dashboard tab.

### Phase 4: Optional Personalization

Only after V1 usage validates the panel set, add user-scoped hide/reorder preferences
with `(organization_id, user_id, dashboard_key)` integrity. Begin with a fixed allowlist
of widget keys and server validation. Do not create arbitrary formula/custom-SQL panels.

## Architecture And Authorization

```text
DashboardView
  -> dashboard API client
    -> GET /dashboard?view=&asOfDate=
      -> authentication + organization isolation
      -> reports.view baseline permission
      -> per-widget permission/capability eligibility
      -> DashboardSummaryService / widget builders
        -> Report, aging, integrity, banking, period-close services
        -> tenant-scoped PostgreSQL queries
      <- response with only eligible widgets and drill-down descriptors
  <- render server-calculated values and routes
```

- The server derives the organization and permissions from authentication, not from URL
  parameters or client-selected roles.
- A widget is omitted or returned as `unavailable` when its capability/permission is
  absent; hidden source data is never sent and merely concealed in React.
- All queries include `organization_id`; IDs in drill-through descriptors are scoped and
  reauthorized by their destination route.
- Financial data is not stored in local storage, service-worker caches, or long-lived
  client caches. Refresh must replace data atomically at the widget/response boundary.

## Performance And Reliability

- Target normal-tenant dashboard API p95 below 750 ms and initial visual completion below
  1.5 s on a warm connection; measure before setting stricter production SLOs.
- Run independent eligible widget reads concurrently with bounded, query-specific limits.
  A slow optional widget may show an explicit unavailable state, but never an old number.
- Add or verify indexes only after `EXPLAIN ANALYZE` on real representative query shapes,
  especially organization/status/due-date and organization/reconciliation-status paths.
- Include `generatedAt` and server request correlation in logs; capture widget timing and
  availability reason without logging amounts or customer data.

## Verification Plan

### Server

1. Exact-money, posted-only, tenant-isolation, date-boundary, empty-state, and ranked
   attention tests for every widget builder.
2. API authorization matrix: owner-safe dashboard, no audit leakage, capability-disabled
   forecast, invalid query rejection, and failure-safe widget response.
3. Contract tests ensure all drill-through descriptors name supported destinations and
   never include cross-tenant entity IDs.
4. Regression tests for existing `/dashboard-summary` until its removal.

### Client And E2E

1. Unit tests for loading, no-data, unavailable-capability, API-error, and date context.
2. Interaction tests for each drill-through, navigation back, refresh, and role/permission
   visibility.
3. Chromium desktop and mobile flow: create/post invoice and bill, record payment, create
   unmatched bank item, reload, verify figures/attention order, reconcile, and verify the
   dashboard updates from the server.
4. Accessibility pass: keyboard tab order, visible focus, semantic headings, aria labels
   for icon controls, and readable mobile action queues.
5. Run full unit/integration suite, production build, and targeted browser screenshots at
   desktop and mobile widths.

## Decisions Logged By The Review

| Decision | Classification | Outcome | Reason |
| --- | --- | --- | --- |
| One role-adaptive dashboard rather than separate product areas | Taste | Adopt | Preserves one entry point while matching distinct daily jobs. |
| Start with fixed, evidence-backed widgets rather than an arbitrary dashboard builder | User challenge | Adopt as a phased approach | A builder would multiply permission, query, and accounting-truth risks before the useful panel set is proven. |
| Add forecast to V1 | Mechanical | No, capability-gate it | The application already treats forecasting as an optional trusted finance feature. |
| Reuse `AccountantOverviewService` unchanged | Mechanical | Reject | Its fixed period and unchecked money conversion violate dashboard truth rules. |
| Persist layouts in V1 | Taste | Defer | Local, non-financial view choice is sufficient while widget value is validated. |

## GSTACK REVIEW REPORT

### CEO Review

The dashboard should sell confidence through decisions, not feature density. The chosen
scope creates a daily owner loop (cash, collect, pay, perform), a cash-operator loop
(reconcile and schedule), and a close loop (prove and resolve). The primary rescue from
failure is the attention queue: every warning must say what is wrong, why it matters, and
where to resolve it.

### Design Review

Target score: 9/10 for hierarchy, information density, responsive operation, and trust.
Use compact financial typography, neutral surfaces, clear status colors, icon-only
controls with tooltips where standard, and no visual treatment that makes an uncertain
financial value look authoritative. The first viewport must expose cash, receivables,
payables, and the first actionable exception without requiring a chart scan.

### Engineering Review

The highest-risk concerns are stale/browser-derived financial values, client-side role
authorization, duplicate report logic, and dashboard-specific money coercion. The plan
addresses them through server-owned DTOs, exact-money helpers, per-widget eligibility,
reuse of established report services, compatibility coverage, and tenant/permission tests.

### Developer Experience Review

The dashboard API must have one documented DTO and deterministic fixture builder so UI
tests do not depend on local dates or incidental seeded records. Add endpoint examples,
widget ownership notes, and a short decision log to the project documentation with the
implementation.

### Approval Gate

Recommended implementation order: **Phases 0 and 1 first**, then Cash Operations, then
Close & Controls. This yields a useful daily dashboard without shipping any forecast or
customization that the accounting engine cannot yet certify.
