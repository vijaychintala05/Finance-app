# Dashboard widget design review — 2026-09-16

Scope: cash/bank widgets in the supplied references, the executive dashboard,
and the Cash & Liquidity view. Implemented locally; not deployed to NAS.

## Reference analysis

- Image 1: account rows total 1,713,750, while the headline is 1,842,750.
  The bank subtotal and treatment of petty cash also disagree with the rows.
- Image 2: signed account rows total 1,442,300, while the headline is 1,842,300.
  A credit-card liability needs explicit treatment; it is not an available cash asset.
- Image 3: rows do total 1,842,500. Its donut repeats the account list and headline,
  while the unexplained Other Accounts bucket prevents useful decisions.
- All three devote substantial space to presentation. A table, date, account
  coverage, negative balances, and an action to investigate are more useful.
  No example values, percentages, logos or invented histories were copied.

## Changes

1. Replaced the account-card grid with one CashBalanceWidget reused in overview
   and liquidity. Lists lowest balances first; negative balances have text warnings.
2. Added labelled search, show all/fewer, visible account counts, and explicit
   wording that filtering the list does not change the headline total.
3. Removed the backend five-account truncation. The widget now receives the entire
   existing tenant-scoped, date-bounded posted-account result.
4. Added bank workspace and reconciliation actions. Unavailable reconciliation is
   not presented as zero; zero unmatched items does not certify reconciliation.
5. Removed the invented cash sparkline and unconditional Reconciled badge.
6. Labelled the income/expense chart as Income & Expense Activity: its source
   queries income and expense accounts, not monetary account movements.
7. Explicitly labels the selected balance date and book balance basis. No bank-feed
   freshness or spendable-funds claim is invented.

## Verification

- 11 tests passed across cashBalanceWidget, dashboardApi and
  dashboardCashFlowRealtimeQA. Type checking passed.
- Component browser inspection with synthetic data: account expansion, searching,
  reconciliation callback and a 360px-wide layout verified. Screenshot evidence
  was displayed in the review conversation.
- This was not an authenticated NAS or full-dashboard browser qualification.
- Existing bill-payment work and concurrently appearing report-workspace edits
  were preserved and are outside this review.

## Remaining limitations

- No historical monetary-account balance series is supplied by this API; no
  percentage change or six-month balance chart is fabricated.
- The existing cash query uses asset subtype plus legacy account-name matching.
  Classifying restricted deposits/clearing accounts needs a separate accounting
  contract review before claiming immediately available cash.
- Reconciliation counts are current imported-statement counts, not certification
  of every account as of the historical balance date.
- No per-account drill-down is claimed: the action opens the existing banking
  workspace. Record-specific navigation needs a supported account-ID route.
- The remaining dashboard date presets and permission-dependent KPI empty states
  merit a separate functional audit. This review does not certify every widget.

## Quick wins delivered

Truthful balance labels; removal of decorative trend; visible negative balances;
complete account coverage; keyboard-accessible search and action buttons.
