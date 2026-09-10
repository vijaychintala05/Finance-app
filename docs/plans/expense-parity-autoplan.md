# Expense Parity: Safe Implementation Plan

## User outcome

Bring the direct-expense workspace to practical Zoho Books parity while preserving
the application's accounting invariants: every money movement posts a balanced
journal, posted documents remain immutable, tenant data stays isolated, and all
corrections are auditable reversals.

## Scope

1. Deploy the already-completed `Edit & correct` expense workflow to NAS.
2. Add certified direct-expense tax/GST/TDS treatment, including input-tax
   accounts, tax-inclusive/exclusive calculation, reverse charge where configured,
   and reporting integration.
3. Add employee-paid expenses and reimbursement lifecycle: draft/submit/approve,
   employee payable, reimbursement payment, reversal, and audit trail.
4. Add mileage expenses using fixed organisation mileage rates, distance and
   odometer inputs, vehicle records, billable/project links, and GL posting.
5. Add multi-currency expenses with immutable rate snapshots, base-currency
   journal amounts, and realised/unrealised FX handling where settlement differs.
6. Add controlled CSV/XLSX import: template, preview, row validation, idempotency,
   duplicate handling, error download, approval-aware posting, and audit records.
7. Expand receipt evidence to PDFs and durable object storage, with OCR extraction
   review, retention policy, malware/size validation, and recovery export support.
8. Block expense correction/void when a linked cash movement is bank-reconciled;
   require audited unmatch/reversal first.
9. Add dimensions/reporting tags, configurable expense fields/policies, clone,
   saved/custom views, export, and safe bulk actions.
10. Add corporate-card transaction ingestion and deterministic matching, with
    unmatched clearing-account entries and review queue.

## Non-goals

- Raw card-data processing or a payment provider.
- GPS tracking in the first mileage release; mobile capture follows server workflows.
- Direct mutation of posted expense rows or journal lines.
- Deployment until each stage passes its database, accounting, security, and UI gates.

## Initial architecture constraints

- `ExpensePostingService.createAndPost` is the authoritative direct-expense posting path.
- `ServerPostingEngine` persists balanced journal entries; cash/bank accounts must
  be selected by immutable account ID.
- `FinancialDestructiveActionsService` owns posted-journal reversals.
- Every database record and lookup must be scoped by `organization_id`.
- NAS only runs the `nas-deploy` branch after release checks and explicit host restart.

## Initial delivery stages

| Stage | Deliverable | Exit gate |
|---|---|---|
| 0 | Release current correction workflow | NAS renders Edit & correct and health/ready checks pass |
| 1 | Tax/GST/TDS direct expenses | Tax journal lines, returns, reversals, and period locks reconcile |
| 2 | Employee claims and reimbursement | Claim-to-payable-to-bank chain is balanced, approved, reversible |
| 3 | Mileage and multi-currency | Rate snapshots, FX/mileage calculations, and reports reconcile |
| 4 | Import, receipts, OCR, dimensions | Idempotent preview/post, secure evidence lifecycle, tenant isolation |
| 5 | Views, exports, bulk, clone, policies | No unsafe bulk mutation; every action is permissioned and audited |
| 6 | Corporate card matching | Clearing account reconciles to card feed and matched expenses |
| 7 | Certification | PostgreSQL, concurrency, RBAC, tenant, reconciliation, and browser QA pass |

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | Intake | Preserve immutable postings and implement corrections by reversal/replacement | Mechanical | Completeness | Keeps GL, cash balances, reports, and audit history consistent | In-place edit of posted expenses |
| 2 | Intake | Deliver tax and reimbursements before convenience features | Mechanical | Accounting correctness | These change financial statements and cash obligations | UI-only parity first |
