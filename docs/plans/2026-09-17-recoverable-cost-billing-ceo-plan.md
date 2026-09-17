---
status: ACTIVE
mode: SCOPE EXPANSION
---
# Recoverable-cost billing: CEO and implementation plan

## Outcome and product decision

Record a real expense once, preserve its cost and payment journal, and let staff price the customer recovery privately. The customer sees a reviewed invoice line with the final selling price, never the cost or markup percentage. Multiple expenses, bill lines, and project time can be combined into one invoice without duplicate billing.

This follows Zoho Books' documented pattern: select a customer, optionally associate a project, mark the cost billable, enter or accept markup, save as unbilled, then select unbilled items while creating an invoice. Zoho's iOS flow also exposes unbilled expenses and projects in the invoice editor. Sources: [expense workflow](https://www.zoho.com/in/books/help/expense/basic-functions.html), [invoice selection](https://www.zoho.com/books/kb/time-tracking/include-unbilled-expense.html), [multiple expenses](https://www.zoho.com/in/books/kb/invoices/multiple-expenses-invoice.html), [iOS workflow](https://help.zoho.com/portal/en/community/topic/accounting-on-the-go-series-12-effortless-invoicing-adding-unbilled-expenses-and-projects-on-the-go-with-zoho-books-mobile-app?page=1), [default markup](https://www.zoho.com/sa/books/help/settings/preferences.html).

The user approved the Zoho-style unbilled selection flow and expansion to vendor bills, project time, private profitability reporting, and an overridable organization default markup.

**12-month vision:** one trusted customer billing queue contains every recoverable cost and hour, each with a private cost and approved selling price. Staff can assemble an accurate invoice in minutes, see what remains unbilled, and prove the margin and ledger trail later. The redesign moves today's isolated one-expense conversion toward that shared queue without rebuilding expense or invoice posting.

## Existing leverage and material gaps

- `ExpenseModal.tsx` already captures customer, project, and billable status in the desktop form. An in-progress mobile redesign shows customer and billable controls but does not yet expose project selection. Neither form has markup or a final-price preview; both must share the same billing logic.
- `ExpensePostingService.createAndPost` validates customer/project tenancy and creates the expense and its journal atomically. Keep this as the expense accounting authority.
- `expenses` already stores `client_id`, `project_id`, `is_billable`, `is_billed`, and `invoice_id`; `invoice_items` lacks a source-charge identity. Neither table stores markup or a private cost/price snapshot.
- `FinanceController.convertExpenseToInvoice` immediately invokes `SalesEngine.createAndPostInvoice`. It creates one invoice per expense; a draft or submitted invoice reserves the expense through `invoice_id`.
- `SalesEngine.postApprovedInvoice` marks reserved expenses billed after its posting journal. The existing billable-expense report only sums original expense amounts.
- **Release blocker:** `FinanceController.sendInvoiceEmail` changes a `DRAFT` invoice to `POSTED` with a direct SQL status update and no posting journal. That path must use canonical invoice posting before draft invoices are used for recoverable charges.
- **Lifecycle blocker:** `FinancialDestructiveActionsService.voidInvoice` reverses the invoice journal but does not release linked expenses; `voidExpense` does not visibly guard against a live billed invoice. The new state model must handle both directions.

## Alternatives considered

| Approach | Effort / risk | Completeness | Assessment |
|---|---|---:|---|
| Extend current Convert to Invoice with an expense markup field | S / low | 6/10 | Reuses today's endpoint, but still creates one invoice per expense and misses the invoice-side unbilled queue. |
| Auto-create a draft invoice on every expense save | M / medium | 7/10 | Fast apparent handoff, but clutters drafts and couples expense entry to invoice timing. |
| **Unified recoverable-charge queue, chosen** | L / medium | 9/10 | One private source record per charge, customer-specific selection, multi-source invoices, auditable pricing and reversals. |

## Experience and state model

1. Record expense as today. After choosing a customer, open a focused project/billing dialog. Offer only that customer's active projects plus **No project**. A project is optional; a customer is mandatory only when billable is enabled.
2. If **Bill to customer** is enabled, show markup percentage, prefilled from the organization setting but editable by an authorized user. Show **Cost basis → markup → final customer price** and an explanation that the customer only sees the final price. For example, ₹1,000 at 15% becomes ₹1,150 before applicable sales tax. Use a sensible, explicit zero-markup option.
3. Saving the expense posts its own balanced expense/payment journal and creates an **UNBILLED** private charge. It does not create AR or revenue.
4. In the invoice editor, selecting a customer shows a count and total of that customer's unbilled charges. A picker filters by project/source/date, supports multiple selection, and inserts customer-safe descriptions and final prices. Expense detail **Convert to Invoice** opens the same editor preselected; it no longer silently posts.
5. A saved draft reserves selected charges. Posting/approval atomically posts the invoice journal and marks charges **BILLED**. Abandoning or voiding a draft releases them. Voiding a posted invoice reverses its journal and reopens or settles its source charges according to an explicit policy and audit trail.

```text
Expense / bill line / project time
  -> private recoverable charge (UNBILLED)
  -> invoice editor selection (RESERVED on draft/submission)
  -> canonical invoice post + AR/revenue journal (BILLED)
  -> void/credit workflow + audited release or adjustment
```

The private charge is the authoritative billing state. Existing `expenses.is_billed` and `invoice_id` remain compatibility projections during migration, not an independent source of truth. Keep an assignment history linking charge, invoice line, invoice, and reversals. Enforce at most one active invoice assignment per charge in the database.

## Accounting, pricing, and privacy invariants

- The original paid expense remains Dr expense/input tax and Cr the selected money account. Markup does not alter its cost, bank balance, or original journal.
- A draft/reservation creates no AR or revenue. Canonical invoice posting creates balanced Dr AR / Cr revenue and applicable output-tax lines. A status change alone cannot certify posting.
- Compute and validate the recoverable cost basis, markup, and selling price on the server with decimal money arithmetic and explicit rounding. Store immutable cost, markup, currency, and quoted-price snapshots. The default base is the economic cost excluding recoverable input tax; tax/withholding and foreign-currency cases require policy validation before release.
- Invoice line description, API, PDF, email, portal, and attachments expose only customer-approved wording, quantity, final rate/amount, and required taxes. Internal vendor, receipt, cost, margin, and markup fields stay in permissioned internal records. Never auto-attach the source receipt.
- Validate source/customer/project/organization IDs on every read and mutation. A user who can enter an expense cannot necessarily change markup or issue an invoice. Record actor, old/new price, and reason for overrides.
- Concurrency and retry safety: row-lock selected charges, use idempotency keys, and require a unique active assignment. Failed invoice creation leaves the charge unbilled; failed posting leaves it reserved and creates no partial journal.
- A posted invoice cannot outlive an inconsistent charge link. Voids, credit notes, corrections, and source reversals use audited transactions and preserve history rather than deleting it.

## Staged delivery and exit gates

| Stage | Deliverable | Exit gate |
|---|---|---|
| 0. Certify existing lifecycle | Route draft email through canonical posting; audit `POSTED` invoices without journals; define and implement invoice/expense void-release behavior; assess legacy linked rows without changing them silently. | No draft-to-posted status-only path; posting and reversal tests pass on real PostgreSQL; a migration preflight reports ambiguous historical rows. |
| 1. Price billable expenses | Customer-first project/billable dialog, organization default markup, server-calculated quote snapshot, private charge state and audit trail. Preserve existing expense journal and old rows. | ₹1,000 + 15% yields ₹1,150; 0% and itemized cases work; invalid percent, project mismatch, cross-tenant IDs, and unauthorized override fail. |
| 2. Invoice unbilled picker | Customer-specific multi-select in invoice editor; expense-detail preselection; draft reservation, approved posting, and source-to-invoice-line history. | Several charges can share one invoice; double clicks cannot bill twice; PDF/email/portal reveal final price only; GL, AR, tax, and charge state reconcile. |
| 3. Extend source types | Admit eligible vendor-bill items and project time to the same charge model. Keep each source's own posting/approval lifecycle; no revenue until invoice posting. | Mixed-source invoice succeeds; each source is traceable and cannot be selected twice or across tenants. |
| 4. Profitability and rollout | Internal report for cost, selling price, gross profit, customer/project, and state; settings and migration backfill; staged production rollout. | Report ties to posted invoice lines and source costs; legacy data is classified without fabricated markup; reconciliation and recovery restore preserve charge links. |

Deploy stages independently behind a feature gate. Migrations add nullable fields/tables and backfill conservatively; do not recalculate or overwrite historical invoices or journals. Roll back application code without dropping financial history. Certify against a staging PostgreSQL copy with masked data before NAS promotion.

## Verification and operational review

- Database/integration: journal balance, invoice-post atomicity, amount rounding, tax boundary, unique active assignment, cross-tenant ID rejection, permissions, concurrent select/post/retry, correction/void/credit transitions, historical backfill, and restore parity.
- UI/browser: desktop and mobile customer-first dialog, keyboard/focus behavior, customer change clearing an invalid project, optional no-project path, markup preview, multi-select, empty/error/loading states, and post-save invoice state.
- Privacy: snapshot-test PDF, email payload, customer portal, and public API surfaces against internal cost/markup fields. Check that invoice line descriptions never inherit vendor or internal notes by default.
- Performance: paginate the unbilled picker and index charges by `(organization_id, customer_id, state)`; load counts on customer selection rather than every invoice render.
- Observability: counters for unbilled/reserved/billed charges, reservations stuck beyond a safe interval, posted invoices missing journals, posted charges lacking a valid invoice line, and reversal failures. Show an actionable operations report before rollout.

## Deferred decisions and risks

- Tax treatment of recoverable/nonrecoverable input tax, GST/RCM/TDS, and multicurrency markup must be signed off against the organization's policies. No generic formula should silently decide these cases.
- Partial billing of a single expense and customer-visible receipt sharing are outside the initial release; the source model should allow later extension.
- Existing one-expense conversion and legacy `is_billed`/`invoice_id` fields must be migrated carefully. Do not remove them until all reads, reports, and recovery exports consume the new charge authority.
- The current invoice editor submits `status: 'Sent'`, which is treated as posted by the engine. Stage 2 must present explicit **Save draft** and **Post/send** actions and preserve the approval workflow.

No application code is changed by this plan.
