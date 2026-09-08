# Payment Accounting Flow Audit

**Repository snapshot:** `3b058e8` on `main` / `origin/main`  
**Audit date:** 2026-09-08  
**Scope:** Every discovered flow that can record, infer, or post a movement of cash, bank funds, card debt, or gateway funds.  
**Method:** Static trace from React UI through Express routes/controllers, services, SQL transactions, journals, ledger queries, cached balances, reconciliation, reversals, tenant controls, and tests. No application code was changed.

## Verdict

The application has a strong central posting engine and the main authenticated receipt, vendor payment, expense, advance, refund, and reversal services generally create balanced journals atomically. The system does **not** yet satisfy the rule universally.

The highest-risk exceptions are:

1. The public customer portal presents simulated card/ACH/UPI fields and records a real customer payment and GL receipt without evidence that a processor moved money.
2. Customer/vendor payments, advances, and refunds do not validate the selected account as a monetary account on the server. Any active, directly postable account in the organization can be used.
3. A gateway event can become `PROCESSED` without a payment or journal when it has no invoice/positive amount, and it can do the same when customer-payment approval turns the receipt into `SUBMITTED`.
4. Posted-source tables allow nullable `journal_entry_id`; the database has no conditional constraint that a final money status requires exactly one journal.
5. Statement-derived journals and approved manual journals bypass parts of the central posting engine. The former does not update cached balances; the latter does not update `bank_accounts.current_balance` or re-run all posting checks.
6. Payroll, reimbursements, owner transactions, loans, tax payments, and gateway payout settlements have no dedicated end-to-end workflow.

The existing `docs/ACCOUNTANT_SIGN_OFF_REPORT.md` makes universal certification claims based on representative test data. It is not evidence that every production path satisfies the payment invariants and conflicts with the findings below.

## Posting architecture and authoritative sources

The normal authenticated flow is:

`React form -> /api/v1/finance or /api/v1/banking -> auth -> organization isolation -> recovery lock -> idempotency -> permission -> controller transaction -> domain service -> ServerPostingEngine -> journal_entries + journal_lines -> accounts.balance + bank_accounts.current_balance -> ledger/reports/reconciliation`

The authoritative accounting record is the pair `journal_entries` and `journal_lines`. `LedgerQueryService` reads only posted journal lines (`server/src/services/LedgerQueryService.ts:27-70,131-183`). `accounts.balance` and `bank_accounts.current_balance` are mutable caches and cannot be treated as independent accounting truth.

`ServerPostingEngine.postEntry` (`server/src/accounting/postingEngine.ts:56-169`) provides the main guarantees:

- validates dates, at least two lines, exactly one positive side per line, cent precision, and exact aggregate debit/credit equality;
- enforces period locks and organization-scoped active, unlocked, directly postable accounts;
- inserts the journal header and lines, updates `accounts.balance`, and updates linked `bank_accounts.current_balance` in one transaction (`postingEngine.ts:139-163`);
- scopes customer, vendor, and project dimensions to the organization.

It does **not** validate the business role of a payment account. An active Expense, Inventory, AR, AP, Equity, or other nonmonetary account passes its account checks.

## Required flow matrix

`Connected` under reconciliation means the service/API can manually match the source; it does not mean automatic matching or complete UI support.

| Flow | Money In/Out | Expected Debit | Expected Credit | Journal Created? | Cash/Bank Hit? | Atomic? | Reversal Correct? | Reconciliation Connected? | Status | Code location |
|---|---|---|---|---|---|---|---|---|---|---|
| Customer receipt / invoice payment | In | selected bank/cash/gateway clearing | AR; excess to customer advances | Yes after approval | Conditional: supplied account is not type-checked | Yes in normal/approved posting | Journal and invoice reverse; customer cached balances are not restored | Yes, manual | PARTIAL | `SalesEngine.ts:2114-2527`; `/finance/payments-received` |
| Public portal payment | In, claimed | selected/automatic receipt account | AR | Conditional | No guarantee; automatic query can pick any Asset | Payment call is transactional | Uses customer-payment reversal after creation | Manual after creation | FAIL | `CustomerPortalView.tsx:978`; `CustomerPortalService.ts:283-387`; `/public/portal/:token/pay` |
| Vendor / bill payment | Out | AP; excess to vendor advance | selected bank/cash/card | Yes after approval | Conditional: supplied account is not type-checked | Yes | Yes for journal, bills, advance, and vendor cache | Yes, manual | PARTIAL | `PurchasesEngine.ts:1409-1846`; `/finance/vendor-payments` |
| Expense paid directly | Out | validated expense account | validated bank/cash/wallet/clearing/card account | Yes | Yes | Yes | Yes, immutable void/reversal | Yes, manual | PASS | `ExpensePostingService.ts:35-205`; `/finance/expenses`; `FinancialDestructiveActionsService.ts:879-907` |
| Recurring paid expense | Out | validated expense account | validated payment account | Yes through expense service | Yes | Yes per occurrence | Expense void path exists | Yes, manual | PARTIAL | `RecurringTransactionService` -> `ExpensePostingService`; `/recurring` |
| Customer overpayment / advance in receipt | In | selected receipt account | customer advances liability | Yes in payment journal | Conditional | Yes | Reverses if advance remains unapplied | Payment can be matched | PARTIAL | `SalesEngine.ts:2252-2364` |
| Standalone customer advance | In | selected receipt account | customer advances liability | Yes in service | Conditional | Yes | No dedicated reversal route/service | No dedicated create UI/API or reconciliation type | NOT IMPLEMENTED | Service only: `SalesEngine.ts:2689-2757` |
| Vendor advance | Out | vendor advance asset | selected payment account | Yes | Conditional | Yes | Yes | No dedicated reconciliation type | PARTIAL | `PurchasesEngine.ts:1852-1907`; `/finance/vendor-advances` |
| Customer refund | Out | AR | selected bank/cash | Yes | Conditional | Yes | Yes; blocks reversal while reconciled | Yes, manual | PARTIAL | `SalesEngine.ts:3216-3289`; `/finance/customer-refunds` |
| Vendor refund | In | selected bank/cash | AP | Yes | Conditional | Yes | Yes for tested debit-note case | Yes, manual | PARTIAL | `PurchasesEngine.ts:2434-2554`; `/finance/vendor-refunds` |
| Credit note with cash refund | Out | AR in refund journal | selected bank/cash | Yes via customer refund | Conditional | Yes | Credit note/refund chains are preserved | Refund is matchable | PARTIAL | `SalesEngine.ts:2990-3289` |
| Debit note with cash refund | In | selected bank/cash | AP in refund journal | Yes via vendor refund | Conditional | Yes | Tested reversal restores note and journal | Refund is matchable | PARTIAL | `PurchasesEngine.ts:2030-2554` |
| Bank-to-bank transfer helper | Both | destination bank | source bank | Yes | Yes, both bank profiles | Yes | No transfer source record or dedicated reversal | Journal/transfer type can be matched manually | PARTIAL | `BankReconciliationService.ts:934-1040`; service/test only |
| Cash/bank transfer from UI | Both | destination treasury account | source treasury account | Yes as manual journal | Conditional under approval bypass | Yes per journal | Manual-journal reversal only | Journal can be matched | PARTIAL | `RecordBankTransactionModal.tsx`; `ManualJournalService.ts` |
| Statement line -> accounting transaction | In or Out | bank or target | target or bank | Yes | Yes in journal | Yes for journal+match | No dedicated reversal; unmatch does not reverse GL | Yes, immediately matched | FAIL | `BankReconciliationService.ts:816-931`; service/test only |
| Payroll / salary payment | Out | payroll payable/expense | bank/cash | No dedicated flow | N/A | N/A | N/A | No | NOT IMPLEMENTED | Account taxonomy only |
| Employee reimbursement | Out | reimbursement payable/expense | bank/cash | No dedicated flow | N/A | N/A | N/A | No | NOT IMPLEMENTED | Permission/settings text only |
| Owner contribution | In | bank/cash | equity/contribution | Generic manual journal only | User-dependent | Per manual journal | Generic reversal only | Journal match only | NOT IMPLEMENTED | No source table/service/route/UI |
| Owner withdrawal / drawings | Out | drawings | bank/cash | Generic manual journal only | User-dependent | Per manual journal | Generic reversal only | Journal match only | NOT IMPLEMENTED | No source table/service/route/UI |
| Loan received | In | bank/cash | loan payable | Generic manual journal only | User-dependent | Per manual journal | Generic reversal only | Journal match only | NOT IMPLEMENTED | No source table/service/route/UI |
| Loan repayment | Out | loan principal + interest expense | bank/cash | Generic manual journal only | User-dependent | Per manual journal | Generic reversal only | Journal match only | NOT IMPLEMENTED | No amortization/source workflow |
| Tax payment | Out | tax payable | bank/cash | No dedicated flow | N/A | N/A | N/A | No | NOT IMPLEMENTED | GST evidence UI states filing/payment requires integration; manual journal restricts controls |
| Gateway receipt | In, claimed | current implementation: final bank | AR | Conditional | Conditional account resolution | One DB transaction when posting occurs | No chargeback/refund event lifecycle | No gateway-clearing reconciliation | FAIL | `PaymentGatewayService.ts:75-253`; `/public/webhooks/gateway/:gateway` |
| Gateway settlement/payout | In | bank | gateway clearing, net of fees | No | No clearing/payout posting | N/A | N/A | No | NOT IMPLEMENTED | No payout/settlement source model |

## A-N control matrix

Legend: **Y** = demonstrated in the application path; **N** = absent/incorrect; **C** = conditional or incomplete; **—** = no dedicated flow. For missing workflows, manual journals do not count as implementation of the business flow.

| Flow | A journal | B balanced | C monetary side | D selected account | E immutable ID | F GL | G cash/bank balance | H recon | I source can lack journal | J journal can outlive failed source | K atomic | L edit/void/reverse | M retry safe | N tenant isolation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Customer/invoice payment | Y | Y | C | C | C | Y | C | Y | C | N | Y | C | C | Y |
| Public portal receipt | C | Y when posted | N | N | C | C | C | C | Y | N | Y | C | N | C |
| Vendor/bill payment | Y | Y | C | C | C | Y | C | Y | C | N | Y | Y | C | Y |
| Direct expense | Y | Y | Y | Y | Y | Y | Y | Y | C (schema) | N | Y | Y | C | Y |
| Customer advance in receipt | Y | Y | C | C | C | Y | C | C | Y for approved excess row | N | Y | C | C | Y |
| Standalone customer advance | Y service-only | Y | C | C | Y | Y | C | N | C | N | Y | N | N | Y |
| Vendor advance | Y | Y | C | C | Y | Y | C | C | C | N | Y | Y | C | Y |
| Customer refund / credit-note refund | Y | Y | C | C | Y | Y | C | Y | C | N | Y | Y | C | Y |
| Vendor refund / debit-note refund | Y | Y | C | C | Y | Y | C | Y | C | N | Y | C | C | Y |
| Bank transfer helper | Y | Y | Y | Y | Y | Y | Y | C | N/A: no source row | Y: journal is the only record | Y | N | N service-level | Y |
| Manual cash/bank journal | Y | Y | C | Y | Y | Y | C | Y | N/A | N/A | Y | C | C | Y |
| Statement-created transaction | Y | Y | Y | Y | Y | Y | N | Y | N/A | Y | Y | N | C | Y |
| Gateway receipt | C | Y when posted | C | C | C | C | C | N | Y | N | C | N | Y by event ID | C |
| Payroll/reimbursement/equity/loan/tax/payout | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### Answers behind conditional cells

- **A/I:** A final customer/vendor payment created through its normal or approval-post endpoint gets a journal. However, source `journal_entry_id` columns remain nullable, and a portal/gateway operation can report success or `PROCESSED` while the customer payment is only `SUBMITTED`.
- **B:** Central posting proves balance before insert. Direct transfer/statement helpers construct two equal lines. The database only enforces one-sided lines; it does not enforce aggregate balance per journal.
- **C/D:** The backend does not classify accounts in customer payments, vendor payments, advances, or refunds. UI filtering is not an accounting control. `ServerPostingEngine` verifies ownership/status/locking, not `type`/`sub_type` payment eligibility.
- **E:** Supplied IDs are persisted, but customer payment defaults to string `1010` and vendor payment defaults to `acc-bank-1` in the source row while posting resolution can substitute the organization's actual account ID. That is not a stable source-to-ledger identity.
- **F:** Posted journal lines drive ledger queries. A valid central posting updates GL correctly.
- **G:** The central poster synchronizes both caches. Approved manual journals update only `accounts.balance`; statement-created journals update neither cache. Customer/vendor cached subledger balances also have asymmetric update/reversal behavior.
- **H:** Reconciliation supports `payment_received`, `payment_made`, `expense`, `journal`, `transfer`, `customer_refund`, and `vendor_refund` (`BankReconciliationService.ts:703-724`). Matching is manual; no customer/vendor advance or gateway payout type exists.
- **J/K:** Main source and journal writes use one transaction, and fault-injection tests prove rollback. The statement and transfer helpers also use a transaction. Schema-level direct writes remain possible because conditional source/journal constraints are missing.
- **L:** Reversal services preserve original journals and post opposite entries for core payments/refunds/expenses/vendor advances. Standalone customer advances, transfer helpers, statement-created journals, gateway chargebacks, and missing workflows lack complete lifecycle handling.
- **M:** Authenticated mutation routes require an organization-scoped idempotency key in production. Public portal payment bypasses that middleware. Gateway event uniqueness protects repeated event IDs. Direct service callers have no universal idempotency contract.
- **N:** Authenticated endpoints use JWT, active membership, permissions, and organization-scoped SQL. Public portal uses a hashed token. The gateway derives organization ID from caller-controlled query/header/body metadata. RLS also omits `journal_lines` and `payment_gateway_events` and has a fail-open condition when `app.current_org_id` is unset.

## Detailed evidence and trace

### 1. Customer receipt and invoice payment

- **UI:** `src/components/sales/RecordCustomerPaymentModal.tsx` and `PaymentsReceivedView.tsx`; `SettlementWorkspace.tsx` also initiates receivable settlement.
- **API:** `POST /api/v1/finance/payments-received`; approval finalization at `POST /payments-received/:id/post-approved`; reversal at `POST /payments-received/:id/reverse` (`server/src/routes/finance.routes.ts:65-74`).
- **Service/DB:** `FinanceController.recordPaymentReceived` starts the transaction and calls `SalesEngine.recordPayment`.
- **Posting:** `SalesEngine.ts:2252-2288` builds Dr deposit account / Cr AR / Cr customer advance; `persistJournalEntry` delegates to the central poster.
- **Source:** `payments_received`, `payment_received_allocations`, invoice paid/balance/status, and optional `customer_advances` are written in the same transaction (`SalesEngine.ts:2305-2364`).
- **Approval:** `postApprovedPayment` posts the same journal and updates invoices/customer caches (`SalesEngine.ts:2374-2527`). It does not insert a `customer_advances` row when an approved payment has an unallocated balance.
- **Reversal:** `reversePaymentReceived` reverses the journal, invoices, payment, and linked advance (`FinancialDestructiveActionsService.ts:183-276`), but does not restore `customers.receivables_balance` or `advance_balance` changed by the approval path.
- **Control gap:** `depositToAccountId` defaults to `1010` and is used without monetary subtype validation (`SalesEngine.ts:2150,2257`).

### 2. Public customer portal

- **UI:** `CustomerPortalView.tsx:978` labels the card/ACH/UPI inputs as simulated. The UI sends invoice, amount, method, and reference; it does not obtain or verify a provider authorization.
- **API:** unauthenticated `POST /api/v1/public/portal/:token/pay`, protected only by token lookup and persistent rate limit (`server/src/index.ts:90-91`).
- **Service:** `CustomerPortalService.processPortalPayment` validates token/customer/invoice, then calls `SalesEngine.recordPayment` (`CustomerPortalService.ts:283-387`).
- **Account choice:** absent an explicit account, SQL selects the first row whose type is any `Asset`, `Bank`, or `Cash` (`CustomerPortalService.ts:345-352`). This can select inventory, AR, or another nonmoney asset.
- **Result:** a public form can create Dr selected asset / Cr AR and mark an invoice paid even though no gateway confirms a money movement. This is a P0 accounting/event-authenticity failure.

### 3. Vendor and bill payment

- **UI/API:** `RecordVendorPaymentModal.tsx` / `PaymentsMadeView.tsx` -> `POST /api/v1/finance/vendor-payments` -> controller -> `PurchasesEngine.recordVendorPayment`.
- **Posting:** Dr AP for allocations, Dr vendor advance for excess, Cr `paidFromAccountId` (`PurchasesEngine.ts:1561-1585`).
- **Atomicity:** payment, allocations, bill states, vendor/advance cache updates, journal, and caches share the controller/service transaction.
- **Approval/reversal:** dedicated approval posting and immutable reversal exist (`PurchasesEngine.ts:1691-1846`; destructive service `:280-377`).
- **Control gap:** account ownership is checked by central posting, but monetary classification is not. Fallback account identity can differ between source and resolved journal.

### 4. Expense payment

- **UI/API:** expense UI -> `POST /api/v1/finance/expenses` -> `FinanceController.createExpense` -> `ExpensePostingService.createAndPost`.
- **Validation:** server-side payment-account validation accepts defined bank/cash/wallet/undeposited/clearing asset classes and credit-card/loan-credit liabilities; expense account type is also validated.
- **Posting:** Dr expense / Cr selected payment account through `ServerPostingEngine`; expense source and audit row are in the same transaction (`ExpensePostingService.ts:35-205`).
- **Lifecycle:** void creates an opposite journal and marks the source voided (`FinancialDestructiveActionsService.ts:879-907`).
- **Evidence:** direct cash and credit-card expense cases, balance/cache changes, rollback, tenant rejection, and reversal are covered by `server/src/tests/moneyMovementIntegration.test.ts`.

### 5. Advances

- Customer overpayments credit customer-advance liability in the receipt journal and normally insert `customer_advances`.
- The approved customer-payment path credits the liability but does not create the corresponding advance subledger row (`SalesEngine.ts:2440-2513`).
- `recordCustomerAdvance` correctly posts Dr selected receipt account / Cr advance liability atomically but has no creation route/UI and no standalone reversal endpoint (`SalesEngine.ts:2689-2757`).
- Vendor advance has an authenticated create and reversal route and posts Dr vendor advance / Cr selected payment account (`PurchasesEngine.ts:1852-1907`). The selected account is not classified as monetary server-side.
- Applying either advance is a noncash reclassification against AR/AP. Those application journals should not be counted as new money movements.

### 6. Refunds and notes

- Customer refund posts Dr AR / Cr selected refund account and inserts a linked source atomically (`SalesEngine.ts:3216-3289`). The server does not validate the refund account as monetary. A refund without a credit note is allowed and has no source-credit availability check.
- Vendor refund posts Dr selected deposit account / Cr AP and inserts `vendor_refunds` atomically (`PurchasesEngine.ts:2434-2554`). The debit-note happy path and reversal are tested.
- Vendor refund always credits AP, even when `paymentId` is supplied or the economic source should be a vendor advance or expense recovery. `paymentId` is stored but does not influence validation or account mapping.
- Credit/debit note issuance and application are noncash. Money moves only through their refund services.

### 7. Transfers, bank statements, and manual journals

- `createInternalTransfer` posts Dr destination bank / Cr source bank and now updates both account and bank caches atomically (`BankReconciliationService.ts:934-1023`). It bypasses the central poster, lacks a source transfer row/reversal chain, and is not exposed through a dedicated controller/route/UI.
- The visible transfer-like UI uses a manual journal. Normal manual posting uses the central poster. Approval posting directly increments `accounts.balance` and marks the draft posted without updating bank cache or re-running all central posting checks (`ManualJournalService.ts:151-179,201-251`).
- `createTransactionFromStatement` directly inserts balanced journal lines and a reconciliation match (`BankReconciliationService.ts:816-931`). It does not update `accounts.balance` or `bank_accounts.current_balance`, does not use central period/account checks, and has no reversal chain.
- Reconciliation computes the bank GL balance from posted journal lines (`BankReconciliationService.ts:1142-1152`), which is correct and exposes cache drift rather than legitimizing the caches.

### 8. Payment gateway

- **API:** public `POST /api/v1/public/webhooks/gateway/:gateway` (`server/src/index.ts:93-127`).
- **Positive controls:** nonmock gateways require a configured secret and valid HMAC; Stripe/Razorpay amounts are converted from minor units; gateway/event uniqueness gives event-level idempotency (`PaymentGatewayService.ts:75-115,149-155`; schema `migrationRunner.ts:836-850`).
- **Raw-body defect:** `express.json` runs before the webhook route, and the route falls back to `JSON.stringify(req.body)` (`server/src/index.ts:39,98`). Provider signatures cover the exact wire bytes, so reconstructed JSON is not a reliable verification input.
- **Tenant defect:** organization ID is accepted from query/header/body metadata (`server/src/index.ts:110-113`) rather than resolved from a server-owned gateway connection or webhook endpoint.
- **State defect:** the service marks the event `PROCESSED` outside the `if (invoiceId && grossAmount > 0)` block (`PaymentGatewayService.ts:192-238`). Therefore an event can be final without any payment/journal.
- **Approval defect:** if customer-payment approval is enabled, the nested call creates a `SUBMITTED` payment with no journal, but the gateway event is still marked `PROCESSED`.
- **Trace defect:** schema has `payment_id` and `invoice_id`, but the update does not persist them (`PaymentGatewayService.ts:229-237`).
- **Model defect:** the receipt is posted directly to final bank and the fee separately credits that bank. There is no gateway-clearing receivable and no later payout/settlement journal, so net bank payouts cannot be reconciled to gross receipts and fees as a settlement chain.

## Database integrity findings

Relevant tables are defined in `server/src/database/migrationRunner.ts`: `accounts` (`:119`), `bank_accounts` (`:155`), `payments_received` (`:389`), `payments_made` (`:430`), journals (`:490-511`), customer advances/refunds (`:646-673`), vendor advances/refunds (`:735-800`), and gateway events (`:836-850`).

Present controls:

- composite organization/account foreign keys for newer payment/refund relationships;
- foreign keys from nullable source journal IDs to journal entries;
- one-sided positive journal-line check (`migrationRunner.ts:1416-1419`);
- unique organization journal/payment document numbers;
- unique gateway event per organization/gateway/event ID;
- application-level cent-safe balance validation and transaction boundaries.

Missing controls:

1. Conditional constraint: final money statuses must have non-null `journal_entry_id`.
2. Organization-composite source-to-journal foreign keys; current simple journal FKs do not prove the journal belongs to the same organization.
3. Unique source/type link proving one original posting per payment/refund/advance.
4. Deferred aggregate constraint/trigger that every posted journal has equal total debit and credit and at least two lines.
5. Database-enforced monetary role for deposit/payment/refund accounts.
6. Immutable source/journal link after posting, except through controlled reversal metadata.
7. Reversal-chain uniqueness and foreign keys for all sources, including transfer/statement-generated entries.
8. Required gateway-event source links when status is `PROCESSED`.
9. RLS coverage for `journal_lines` and `payment_gateway_events`; current policy also allows access when `app.current_org_id` is unset (`enterpriseHardeningSchema.ts:145-160`).

## Invariant results

| Invariant | Result | Evidence |
|---|---|---|
| 1. Every posted money source has exactly one posting/reversal chain | **FAIL** | Gateway event can be `PROCESSED` with no payment/journal; portal/gateway success can leave a `SUBMITTED` payment; final-status/journal DB constraint and unique source posting are absent. |
| 2. Every money movement affects a monetary GL account | **FAIL** | Customer/vendor payment, advance, and refund services pass caller account IDs to the central poster without type/subtype validation; portal default explicitly allows any Asset. |
| 3. Every journal has equal debits and credits | **PARTIAL** | Central poster proves equality (`postingEngine.ts:68-84`), and direct helpers construct equal pairs. DB only enforces one-sided lines, so bypass/direct SQL can create an unbalanced journal. |
| 4. Cash/bank balance derives from GL without conflicting truth | **FAIL** | Reports/reconciliation derive from journal lines, but `accounts.balance` and `bank_accounts.current_balance` are mutable caches. Approved manual and statement-created journals do not synchronize both caches. |
| 5. Payment creation and GL posting are atomic | **PARTIAL** | Core customer/vendor/expense/refund/advance paths use one transaction and rollback tests pass. Gateway final state can have no posting; nullable source links and bypass paths prevent a universal guarantee. |
| 6. Void/reversal reverses accounting rather than deleting history | **PARTIAL** | Core customer/vendor payments, refunds, expenses, and vendor advances use opposite journals and retain originals. Standalone customer advance, transfer, statement-created entry, gateway chargeback, and missing workflows lack complete reversal chains. |
| 7. Retry cannot duplicate GL entries | **PARTIAL** | Authenticated production mutations use org-scoped idempotency and tests prove duplicate payment suppression; gateway event uniqueness exists. Public portal and direct service calls lack universal idempotency. |

## Critical bugs and integrity risks

### P0

1. **Stop treating the simulated portal form as proof of money receipt.** Post accounting only from a verified, idempotent provider event or a staff-confirmed offline receipt. The current public endpoint can fabricate bank receipts and paid invoices.
2. **Introduce one server-side monetary-account policy and require it everywhere.** Resolve the account to an immutable tenant account ID, validate its allowed role for the flow, and persist the exact resolved ID. Cover customer/vendor payments, both advances, both refunds, portal, gateway, transfers, and statement-created transactions.
3. **Make gateway finality truthful.** Capture exact raw bytes before JSON parsing; resolve tenant and deposit/clearing account from server-owned gateway configuration; reject missing invoice/amount/currency; persist payment/invoice IDs; mark `PROCESSED` only after a posted journal exists. Define approval behavior for already-settled gateway cash.
4. **Add database posting invariants.** Final source status must require an organization-matching journal; enforce one original posting per source; enforce aggregate posted-journal balance; make posting/reversal links immutable.
5. **Route all journal creation through one posting/finalization engine.** Eliminate direct SQL posting in statement creation, internal transfer, and approval posting, or make those paths call a common transaction-scoped finalizer with period/account/dimension/cache checks.

### P1

1. Create a customer-advance row for approved overpayments and make customer receivable/advance cache updates symmetric on create and reversal.
2. Make vendor refund account mapping source-aware: debit note -> AP; vendor advance return -> vendor advance; payment over-refund -> appropriate AP/advance; direct expense recovery -> expense or other configured recovery account. Validate vendor/source/available amount.
3. Add a dedicated transfer source with status, source/destination account IDs, journal link, idempotency key, reconciliation references, and immutable reversal.
4. Add gateway clearing and payout settlements: receipt Dr gateway clearing / Cr AR; payout Dr bank + Dr fees / Cr clearing; refunds and chargebacks reverse the appropriate chain.
5. Classify cash-flow accounts by system role/subtype configuration rather than names. Current name/subtype matching in `CashFlowStatementService` misses wallets, clearing, undeposited funds, and credit cards.
6. Complete user-facing reconciliation matching/suggestions. The service/API exists, but the visible reconciliation UI mainly exposes summary/completion.
7. Close tenant gaps by adding RLS for journal lines/gateway events and fail closed when organization context is absent.

### P2

1. Add dedicated payroll/salary, reimbursement, owner contribution/drawings, loan drawdown/amortized repayment, and tax-payment workflows.
2. Consolidate duplicate customer-advance application implementations and make all service/background entry points idempotent.
3. Replace or qualify the existing universal accountant certification with evidence scoped to tested data and paths.

## Missing automated tests

1. Reject nonmonetary accounts for every receipt/payment/advance/refund/portal/gateway path.
2. For every final money status, assert exactly one organization-matching original journal and a valid reversal chain.
3. Approved customer overpayment creates an advance subledger row; reversal restores customer caches.
4. Portal cannot post without provider/staff confirmation and duplicate submissions cannot double-post.
5. Gateway tests for exact raw bytes, tenant spoofing, missing invoice, zero/negative/invalid amount, currency, numeric timestamps, approval-enabled organizations, source-link persistence, and concurrent duplicate delivery.
6. Approved manual bank journal revalidates period/account state and updates bank cache.
7. Statement-created transaction updates all caches through the central engine and can be reversed without deleting history.
8. Vendor refund tests for debit note, vendor advance, original payment, expense recovery, invalid source/vendor/account, over-refund, and concurrent reversal.
9. Cash-flow report includes bank, cash, wallet, clearing, undeposited funds, and card movements by configured role.
10. Real PostgreSQL tests for RLS, conditional final-status constraints, composite organization journal links, and aggregate journal balance. Pg-mem cannot execute all production `DO $$` constraint blocks.

## Verification performed

- Current commit `3b058e8`: `paymentAccountingFlowAudit.test.ts` and `moneyMovementIntegration.test.ts` — **2 files, 17 tests passed**.
- Preceding accounting-hardening commit `147ed8d`: full Vitest run — **114 files, 973 tests passed**; lint passed. The only later code change fixes the bill nonnegative check column from `paid_amount` to `amount_paid` and adds the invoice check.
- Passing tests demonstrate representative happy paths. They do not establish universal invariants. In particular, the invariant test in `paymentAccountingFlowAudit.test.ts:328-337` only asserts that at least one journal in the organization touches an Asset/Bank/Cash account; it does not assert that every payment journal touches a valid monetary account.

## Confidence limits

- I did not execute against a live production database or inspect production rows, gateway dashboards, bank feeds, environment secrets, or deployed RLS policies. This is a code/schema/test audit of the current repository.
- I did not find a dedicated UI/API for standalone customer advance creation, internal transfer helper, statement-created journal helper, payroll, reimbursement, owner transactions, loans, tax payment, or gateway payout settlement. Some service-only methods are exercised by tests and may be intended for future controllers.
- Automatic bank-feed provider behavior cannot be certified from this repository because external provider responses and real webhook byte streams were not available.
