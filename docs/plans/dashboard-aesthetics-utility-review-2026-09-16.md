# Dashboard design and utility plan

Date: 2026-09-16. Target: the running full dashboard at `localhost:3000` and its three views. This is a plan; application code is unchanged by this review. The user chose **action queue, then cash and receivables** as the first-screen order.

## Outcome and design rule

An owner should find the next financial action in five seconds, understand the amount and evidence in five minutes, and trust that the same definition will still apply after years of transactions. Treat the dashboard as an entry to workspaces and reports. A widget earns space by answering a question, showing its source and date, and taking the user to the relevant records.

## What already exists

- `DashboardSummaryService.getDashboard` supplies tenant-scoped, date-bounded posted-ledger cash and income/expense data, invoice/bill balances, attention counts, top expenses, bank accounts, integrity checks, and `generatedAt`. It restricts available views by permission.
- `DashboardView` has Overview, Cash & Liquidity, and Integrity & Period Close views, plus loading and API-error states. `CashBalanceWidget` already supplies book-balance labeling, negative-account warnings, search, and all-account expansion.
- `DESIGN.md` calls for calm, precise, conservative financial UI. `src/index.css` already defines IBM Plex Sans/Mono, blue, ink, muted text, hairlines, canvas, and financial numeral styling. Reuse them.

## Observed problems in the running app

1. At a 624 px viewport, the attention queue appears after four summary cards, the cash detail, and a large chart. Several screenfuls separate the user from the first action.
2. Cash is repeated as a summary card and full account widget. Empty top expenses still consumes a large card and donut.
3. The attention section says **ACTION REQUIRED** while displaying five zero-count rows. Zero items should be one quiet completion state, not five tasks.
4. The cash view calls invoices due in seven days **Expected incoming cash**. Due documents are not guaranteed collections. Zero unmatched imported items is labeled **Healthy**, which does not establish complete reconciliation.
5. The chart source is posted income and expense accounts, but the UI still uses cash-flow concepts in parts of the component. The observed chart displayed a 2001 timeline point in a September 2026 view and an INR axis beside USD amounts. These require date and currency contract tests before retaining the chart.
6. Today, MTD, QTD, and YTD controls all send the same as-of date; the server calculates month-to-date income and expenses. Their selected labels currently promise different periods without changing the period.
7. “Integrity & Period Close” presents three green reconciled/balanced claims without an evidence date, checked scope, or direct route to a validation result. The scheduled outlook below it belongs in cash operations.
8. Mobile has nested white cards, icon tiles, small uppercase 11 px labels, and generous repeated padding. The useful rows are visually subordinate to chrome.

## Information architecture

The first viewport has only three jobs. Order is fixed until usage shows a better one.

```text
Header: Dashboard                         [As of date] [Refresh]
        Last updated + period basis        [Reports]
Views:  Overview | Cash operations | Close & controls (authorized only)

Overview, desktop:                         Overview, mobile:
┌─────────────────────────────┬─────────┐   1. Needs attention (top 3)
│ Needs attention, top 3       │ Cash    │   2. Cash book balance + bank status
│ amount • due date • action   │ AR / AP │   3. Collect / pay due next
├─────────────────────────────┴─────────┤   4. Expandable account detail
│ Collect / pay due next, two lists       │   5. Activity and recent records
├───────────────────────────────────────┤
│ Income / expense activity (optional)    │
│ Account detail • Recent records         │
└───────────────────────────────────────┘

Attention row → filtered source list → exact document → post/resolve there
Cash summary  → bank/account workspace → ledger/reconciliation evidence
Income row   → P&L for the selected period
```

On both sizes, show at most three actionable exceptions before “View all.” Rank overdue monetary obligations by severity and amount, then reconciliation items, then approval/draft work that the user can actually perform. Never include zero-count rows in the queue. If none exist, show “Nothing needs action from the available records” with the as-of date and a link to recent activity. Do not say the organization is financially healthy.

## Widget contract and visual treatment

| Widget | User question and content | Action | Evidence and empty state |
| --- | --- | --- | --- |
| Attention queue | What requires me today? Count, amount when meaningful, oldest due date, and reason. | Filtered invoice/bill/reconciliation/journal workspace. | Server-ranked authorized items. If zero, one compact quiet state. If one source fails, show “Status unavailable” for that source. |
| Cash & bank | What do posted monetary accounts total, and which account needs review? One headline and expandable account rows; negative balances first. | Banking and reconciliation. | Posted GL as of selected date, book-balance label, reconciliation state separately. No duplicate cash card. No “available funds” claim. |
| Receivables | Who owes us, how much is overdue, and what should be followed up? Total, overdue amount/count, top three due items. | Filtered AR aging/invoices, then document. | Invoice subledger as of date; no “On track” badge solely from zero overdue percentage. |
| Payables | What is due soon and can we pay it? Open amount, overdue amount, due-next-seven-days amount, top three bills. | Filtered bills/AP aging. | Bill subledger; no implied authorization to pay from the widget itself. |
| Activity | How did posted income and expense change in the selected period? Compact comparative chart or table only if there are at least two valid dates. | P&L report. | Posted income/expense accounts, correct currency/date. For one date show a clear one-row summary. No fabricated balance trend or cash-flow claim. |
| Account detail | Which monetary account holds the book balance? Searchable rows, signed balances, coverage count. | Account workspace; account-ID drill-down only after route contract supports it. | Full ledger-backed account result, explicit as-of and source. No unspecified “Other” bucket. |
| Recent activity | What changed recently? Document number, party, state, amount/date. | Exact source record when authorized. | Only real recent records; empty state has one create/view action. |
| Close & controls | What failed validation and where is the evidence? Last check time, scope, failure/warning counts, links to trial balance/close validation. | Integrity report and period-close workspace. | Distinguish “passed,” “failed,” and “not checked.” Avoid “reconciled” unless the exact check ran for the displayed scope. |

No donut for empty top expenses. When categories exist, use a ranked list with amounts and share of *all period expenses* only if the API supplies that denominator; otherwise omit percentage. Charts support comparison, never serve as decoration or the only path to an answer.

## Interaction states

| Area | Loading | Empty | Error or unavailable | Partial data | Success |
| --- | --- | --- | --- | --- | --- |
| Whole dashboard | Stable shell and dated skeleton; actions disabled only as needed. | Quiet orientation and relevant creation/report action. | Hide uncertain figures; error with retry and request ID. | Show sound widgets, mark missing ones unavailable. | Updated-at and as-of context, no stale flash. |
| Attention | Three row placeholders. | One “No items needing action in available records” line. | No “all clear” message. | Show known rows, note unchecked sources. | Ranked rows with direct action. |
| Cash | One amount/rows skeleton. | “No posted cash/bank activity as of date”; banking setup link. | No zero fallback. | Show book balance and separately unknown reconciliation. | Signed total, account detail, source and date. |
| AR/AP | Amount and row placeholders. | Explain no open invoices/bills; link to list. | Hide amount, retry. | Label missing aging/detail. | Total + overdue/due rows and drill-down. |
| Activity | Compact chart skeleton. | No chart; explain no posted activity. | No fabricated line. | One point becomes a row, not a trend. | Date- and currency-correct comparison. |
| Controls | Validation placeholders. | “No validation run” when applicable. | “Unable to check”; no green badge. | Name unchecked control. | Status, time, scope, evidence link. |

## Journey, aesthetic, and accessibility

- **Five seconds:** the strongest visual anchor is “Needs attention,” with an item count and direct next action. Cash and collections are adjacent context. Remove the authority marketing ribbon from the main hierarchy.
- **Five minutes:** the user inspects why a bill or customer balance appears, opens the source list with its filter, and returns to an unchanged as-of context. Refresh clearly updates figures; it never implies a bank feed refreshed if only dashboard queries ran.
- **Five years:** balances, periods, and control statuses retain stable definitions; every displayed money number can be reconciled to source records or an authoritative report.
- Use IBM Plex Sans for labels, IBM Plex Mono with tabular numerals for amounts. Body and control text target at least 16 px, secondary text at least 14 px where space is tight, never low-contrast 11 px uppercase as the sole label. Keep the existing blue as the sole action accent; reserve red/amber for actual exceptions. Prefer hairlines and spacing over repeated shadows and colored icon boxes.
- Desktop at ≥1024 px: primary 2-column work area, attention column larger than cash context; detail tables below. Tablet 640–1023 px: one main column with side-by-side summary rows where readable. Mobile <640 px: action queue and cash/AR first, compact collapsible lists, sticky native bottom navigation, no horizontal metric scroll. No important action hidden inside hover-only or icon-only controls.
- Every navigation target is a native button/link with visible focus and ≥44 px hit area. Use headings and list semantics, text as well as color for status, aria-live only for refresh completion/error, and labelled chart values or a table equivalent. Do not rely on keyboard-inaccessible clickable `div`s.
- Motion is limited to short loading/state transitions and respects reduced motion. The visual design should still read clearly with all shadows and transitions removed.

## Data and permission decisions

1. Separate **as-of date** (stock balances) from **period start/end** (income/expense). MTD/QTD/YTD must change the period start server-side or be removed until supported. Custom requires start and end or explicit “as of” wording. Use organization timezone/date rules.
2. Keep payment and cash concepts separate: receivables due are planned collections, not cash; ledger cash is book balance, not bank-confirmed spendable funds. Credit cards, restricted deposits, clearing accounts, and negative balances need explicit classifications before inclusion in headline cash.
3. The server, not browser arithmetic, owns totals, ranking, eligibility, source labels, and drill-down descriptors. Use exact-money utilities; no `Number` coercion for financial claims.
4. Do not send unauthorized widget data to React. Empty and unavailable states must differ so a hidden source cannot appear as a zero balance or zero exceptions.
5. Keep the current developer test mode explicitly labelled; validate visual design in both populated and empty real API fixtures, light/dark, and 375/624/1280 px widths.

## Delivery stages and exit gates

| Stage | Work | Exit gate |
| --- | --- | --- |
| 0: Truth fixes | Correct period preset contract, chart date/currency, cash account classification, reconciliation/control wording and evidence, permission-dependent zero fallbacks. | No mislabeled financial state; API tests cover selected date, currency, tenant, permission, empty and failure. |
| 1: First-screen hierarchy | Move ranked attention ahead of metrics, combine duplicate cash surfaces, put AR/AP due work next, remove empty donut and five zero tasks. | At 375 px the first actionable exception and cash context are visible without scrolling through a chart; all rows open a meaningful destination. |
| 2: Detail and reporting | Account coverage/drill-down contract, AR/AP row filters, recent activity links, useful single-point activity state, correct P&L period. | User can trace each visible amount to a source record or report; back navigation preserves date/filter. |
| 3: Controls and polish | Redesign integrity view around evidence and failures; move scheduled due documents to cash operations; typography, focus, reduced motion, dark mode. | Controls show check time/scope and no false success; desktop/mobile/light/dark browser review passes. |

Files likely involved: `src/components/dashboard/DashboardView.tsx`, `src/components/dashboard/widgets/*`, `server/src/services/DashboardSummaryService.ts`, dashboard route/controller, filtered destination views, `src/index.css`, and focused API/UI/E2E tests. Reuse the existing role-adaptive dashboard plan for domain boundaries; this plan supersedes its visual order and state details.

## Review ratings and decisions

| Pass | Before → planned | Finding resolved in plan |
| --- | --- | --- |
| Information architecture | 4 → 9 | User chose action queue first; wireframe and three-job first viewport above. |
| Interaction states | 5 → 9 | Matrix prevents zero/error/unknown conflation. |
| User journey | 5 → 9 | Five-second action, five-minute trace, long-term evidence paths. |
| Generic-design risk | 4 → 9 | Replaces card mosaic, empty donut, decorative icons, and repeated cash. |
| Design-system alignment | 7 → 9 | IBM Plex, blue/ink/hairline tokens and financial type retained. |
| Responsive/accessibility | 5 → 9 | Defined 375/624/1280 layouts, hit targets, semantics, contrast, reduced motion. |
| Unresolved decisions | 4 → 8 | Core order settled by user; exact restricted-account taxonomy and destination filters require implementation discovery. |

## NOT in scope

This plan does not add a dashboard builder, fabricate forecasts, change ledger posting, or certify bank reconciliation. It does not deploy to NAS. Those would need separate accounting and release qualification.

## GSTACK REVIEW REPORT

Target: running full dashboard, reviewed at a 624 px viewport on 2026-09-16. User preference: action queue first, then cash and receivables. Current evidence: screenshots and accessibility states of Overview, Cash & Liquidity, and Integrity & Period Close; source and existing design rules reviewed. Planned design quality improves from a repetitive card layout with misleading states to an action-first, evidence-backed workspace. The plan is ready for implementation, subject to checking exact bank-account classification and filtered navigation contracts in Stage 0. No production or NAS changes made.
