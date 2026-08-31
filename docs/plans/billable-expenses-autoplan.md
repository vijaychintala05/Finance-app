# Billable Project Expenses: Reviewed Implementation Plan

## Intake

**User outcome:** a business owner can record a project cost, identify the customer and
project that incurred it, mark it as recoverable, and include it in a customer invoice
without billing it twice or corrupting project profitability.

**Product decision:** `Bill to customer` means *eligible for invoicing*, not automatic
customer charging. The user will review selected expenses and create an invoice from them.
The original expense remains an expense; invoicing creates the normal accounts-receivable
and revenue entries through the existing invoice engine.

## Initial Code Findings

- `ExpenseModal.tsx` already captures a project ID but exposes every active project and
  submits `isBillable: false` unconditionally.
- `ExpensePostingService.ts` already persists `project_id`, `client_id`, and
  `is_billable`, and validates that a supplied customer matches the selected project.
- `time_entries` already has an unbilled-to-invoice pattern. The project detail screen
  can create an invoice from unbilled time through `/invoice-unbilled-time`.
- Expenses have no durable invoice-source link. A new link is required to make duplicate
  billing impossible under concurrent requests and to retain an auditable trail.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|-----------|----------|
| 1 | Intake | Stage billable expenses for review, then invoice | Mechanical | Completeness | Prevents accidental charging and allows customer-facing invoice edits | Automatically creating an invoice on expense save |
