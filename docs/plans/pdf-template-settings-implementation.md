# PDF Template Settings: Acceptance Checklist

Status: In progress. Source inventory and first renderer/settings improvements are implemented locally; the full 44-template uniqueness and release audit remain open.

## Current Progress

### September 26 Validation

- Draft review PR #2 is open on `codex/release-qualification`; production `main` and `nas-deploy` have not been promoted. External production qualification records remain pending.
- Ordinary and legacy quotation/expense downloads now prefer retained issued PDF bytes. Explicit ordinary/quotation template overrides cannot replace issued evidence. New quotation revisions snapshot a registry template and use the shared renderer; legacy snapshots retain their historical renderer.
- CI identified detached ArrayBuffer failures in PDF settings tests. Parser inputs now use owned Uint8Array copies, preserving the original PDF buffer for later assertions.
- First-page gallery samples were visually inspected for all 14 categories, including all three credit-note variants. This exposed an amount-in-words/notes-heading overlap in the shared renderer; measured spacing and a five-category baseline-position regression now cover the fix. Full-size long-document, tax-heavy, branding, and all-variant manual inspection remains incomplete.
- The settings default and fallback configuration now hydrate from registry assignments/records, with tests mocking that endpoint rather than treating profile JSON as authoritative.
- Latest focused checks: PDF settings acceptance 64/64; quotation historical/permission tests 12/12 on PostgreSQL, including actual registry version/default freezing; settings UI 33/33; template security, branding, registry, artifact and invoice checks 30/30. Final desktop/mobile gallery checks pass 4/4; TypeScript, production build and production dependency audit pass. All three quote models preserve revision tax-inclusive labels, round-off, and distinct item names/descriptions while excluding journal totals and honoring hidden tax/scope/expiry controls. Expense PostgreSQL tests pass 8/8; renderer geometry passes 13/13 across three fonts, both A5 orientations and header modes, wrapped words/audit/annexure fields, and a PostgreSQL-date compact fixture. The PostgreSQL qualification gate passes 7/7. Sol returned PASS for the current integrated implementation. The frozen full-unit run passes 271 files, with 1 skipped file: 2,030 passed tests and 11 skips. Persisted quotation numeric edge cases and the broader manual visual matrix remain incomplete, so this is not full-goal completion or a release qualification claim.
- Manually inspected full-size disposable-database expense renders: the compact A5 voucher fits one page, six-page long allocation output retains both complete journal memos and repeated headers, and attached receipt images render within their annexure. Header-only introductory space on oversized allocations is a remaining packing improvement, not lost posting evidence. Generated visual evidence remains outside Git.

- Confirmed the server-owned catalog contains 14 categories and 44 built-in template variants.
- Settings are organized by category with server-rendered sample and live PDF preview actions.
- Customer and vendor statement variants now distinguish detailed ledger, activity summary, and compact overview output. Sample previews no longer invent aging buckets, and the UI no longer offers inert aging-bucket controls.
- Invoice POS now renders a receipt-style item/quantity/amount table from invoice lines, omitting generic unit-rate and HSN columns; the PDF assertion passes. The long-notes acceptance test also checks text baselines against the footer on every page. The remaining non-statement variants are not yet unique.
- Payment receipt cash-receipt now has an amount-forward AMOUNT RECEIVED panel and optional amount-in-words while retaining persisted invoice allocations; it does not infer cash payment mode. The focused PDF acceptance suite passed 40 tests.
- Credit notes now have three genuinely different compositions: the standard memo uses a reason panel and prominent value band, the sales-return memo is an application ledger with remaining credit, and the adjustment memo is a compact value-first slip. The PDF renderer and both gallery/full-size previews use matching hierarchies. All show only supported note facts; only the sales-return model includes active posted invoice applications. Issuance guards all variants for finalized status, positive exact-cent totals, bounded remaining credit, and a same-tenant posted unreversed journal. Focused PDF tests assert each layout's unique content and value-panel position; focused settings tests navigate all three full-size previews. No returned items, tax split, or original-invoice data are invented.
- The template gallery now limits preset copy to supported category data and standard/ledger/compact presentation; statement thumbnails and expanded previews no longer invent aging buckets. Luna's focused UI suite passed 19 tests.
- The gallery navigation now supports category search, and the full preview opens the server-rendered sample PDF inline. The editor exposes paper size, orientation, PDF font, and per-template color themes supported by the renderer and versioned settings API. Gallery sheets reflect each saved model's title and colors. Proposal/bid, dispatch-note, and commercial-invoice variants have distinct header compositions without claiming unavailable source fields. Light custom colors keep PDF headings, table labels, references, and balance tiles readable. A6 credit-adjustment reasons wrap to the actual panel width. The focused PDF/settings suites pass 83 tests; TypeScript lint and focused diff checks pass. The final focused Sol review passed.
- Earlier focused PDF/settings/email and Windows gate-contract suites passed across five files. Coverage includes all 44 catalog IDs/defaults, six live statement variants, missing/cross-tenant statement parties, explicit preview watermarking, ordinary download behavior, unissued invoice fallback, stale issued-PDF refresh, and outbox/audit rollback. In the current environment, the frontend build passed; the full `npm run build` did not complete because `scripts/build-server.mjs` hit a sandbox access error while resolving `server.ts`.
- Real PostgreSQL qualification ran on PostgreSQL 16.15 against a password-protected disposable temp cluster: all 5 tests passed. The Windows runner now launches the local Vitest CLI through Node instead of spawning `npx.cmd`.
- Remaining: audit and implement meaningful output for the other template variants; wire or remove every unsupported setting/claim; visually verify PDFs and responsive settings UX; broaden release qualification as the renderer changes. Do not treat this progress note as completion.

The legacy expense-voucher URL retains a separate PDFKit renderer because it appends uploaded receipt images as an evidence annexure, which the shared document renderer does not support. Issued requests return the retained artifact bytes. Unissued vouchers now resolve versioned paper size, orientation, typography, variant and visibility controls, with measured accounting rows and explicit continuation pages. Compact A5 and oversized-memo PostgreSQL fixtures pass. Full customization parity and all edge-case geometry remain subject to independent review and visual verification; these results do not complete the entire goal.

## Active completion design

The active Codex goal covers all 14 categories and 44 registered models. A Sol architecture review found that 29 models relied on a generic standard, ledger, or compact body composition before the latest order tranche. The completion path keeps the existing tenant-scoped, versioned template and issued-artifact APIs. It adds an explicit category/model variant contract in the server renderer so sibling models arrange supported facts differently even when optional source fields are absent. Existing specialized statement, credit-note, POS, receipt, and project-recovery branches remain source-backed.

The actual server sample PDF is the visual authority for each gallery card and the full preview. Gallery loading must be bounded and scoped to the active organization/category; object URLs must be released. Each category needs per-model PDF assertions for its distinctive structure plus representative live-record assertions that unchanged amounts, references, and status come from the server. Long text, small paper, landscape, light colors, empty sections, and issued PDF stability remain required checks. Sol final review is required after each material renderer tranche and for the final integrated patch.

The first tranche adds source-backed summary panels for the three sales-order and three purchase-order models. Their operational labels describe order facts without asserting an unrecorded pick, receipt, or requisition event. Long summary values are bounded; full source details remain in their ordinary sections. Gallery cards lazily request actual server sample PDFs, limit concurrent requests, and keep the illustrative sheet as a fallback. Editing a nondefault model no longer writes its versioned configuration into the category/default UI settings. Focused server/UI tests and lint pass, and the Sol reviewer passed the tranche.

The gallery's native PDF iframe painted blank in the local Chromium browser despite a successful sample response. The gallery now renders page one with PDF.js into a canvas, and the full preview renders every page to canvases, which also works under the production content security policy. Browser tests check real PDF response headers and nonwhite pixels in both views on desktop and mobile. The grid sizes columns from available panel width. The bill/vendor-credit tranche passed Sol review after fixing unsupported subtotal/tax claims, generic-reference labeling, and disabled-field leakage. The focused PDF/UI suite passes 89 tests and lint passes.

A second Sol architecture review approved the remaining category work with a stricter visual requirement: distinct information hierarchy, table treatment, and total placement for each model, beyond a three-fact panel. It also requires neutral built-in copy and sample facts where the live source lacks return obligations, matching state, cheque number, claimant evidence, or certification. The next renderer tranche covers quote, challan, and invoice siblings; further tranches cover receipt, expense, vendor-payment, and journal siblings. Existing user-custom titles and issued bytes must remain intact.

Existing tenants may retain old seeded versioned titles after the registry presets are corrected. Sol recommends an append-only, tenant-scoped correction only for provably untouched system v1 versions, with an audited compare-and-swap update; all ambiguous/customized versions remain exact and receive a visible review cue in settings. The current copy tranche changes new seeds and exposes saved titles; an automatic historical correction is deferred until its audit, concurrency, and issued-artifact checks are implemented.

## Goal

Provide useful, distinct PDF templates and template settings for every transaction/document category the application supports. Take workflow inspiration from Zoho Books while preserving FirmBooks' server-authoritative accounting and tenant-isolation rules.

## Product requirements

- Inventory every supported PDF/document category from the application's actual navigation, API routes, and renderer code before deciding coverage. Do not assume the app supports every Zoho module.
- Each supported category must have at least one purpose-built default template. A receipt, statement, sales invoice, purchase document, credit document, and operational document should not be forced through one generic layout when their users need different fields or hierarchy.
- Put template management in organization settings, grouped by document category. Let users identify the active default, preview it, choose among available templates, and restore a built-in default.
- Provide practical branding and layout controls appropriate to each category: organization identity, page size/orientation, typography and color, header/footer, visible fields and labels, line-item columns, totals/tax presentation, notes/terms, page numbering, and category-specific details where supported by source data.
- Preview PDFs using the real server renderer and representative data. Clearly mark sample previews; preview must not issue, post, email, or mutate a transaction.
- Resolve the selected template on the server for both downloads and any email attachment path. Preserve existing endpoint contracts unless an intentional versioned change is required.
- Template settings change future renders only. They must not modify financial records or silently change an already issued/retained PDF. Preserve template/configuration versions or the rendered artifact needed to reproduce issued documents.
- Enforce tenant isolation and permissions for template listing, editing, defaults, branding assets, previews, and transaction PDFs. Audit setting changes without logging sensitive document contents.
- Template configuration controls presentation only. Amounts, taxes, balances, dates, party identities, statuses, and accounting values must come from authorized server-side records and existing money/tax rules.
- Validate and escape configurable content and restrict uploaded branding assets. Do not allow arbitrary scripts, local-file access, or external resource fetching from templates.

## Verification requirements

- Build a category-by-category matrix from the source inventory with the renderer, entry point, representative fields, and test evidence for each category.
- For every supported category, verify the PDF is a valid, readable document with its category-specific content, correct page count behavior, and correct default selection.
- Include long names/addresses, long line-item lists across pages, missing optional branding, zero/negative or credit presentation where applicable, tax-inclusive/exempt cases where applicable, and supported currencies/locales.
- Verify settings authorization, tenant isolation, invalid configuration rejection, preview-without-write, deterministic fallback, and that a default change leaves existing/issued documents unchanged.
- Verify document values against authoritative server data; successful PDF generation alone does not prove financial correctness.
- Run the repository's relevant unit/integration tests, PDF rendering checks, lint, and production build. Run PostgreSQL-backed migration/API verification when the implementation changes persistent schema.

## Zoho-inspired settings reference

Zoho Books groups templates by module and offers built-in layouts, category-specific defaults, preview, default selection, cloning, and deletion constraints. Its general settings include paper size, orientation, margins, fonts, color, backgrounds, and headers/footers. Transaction settings cover organization and party details, document fields, table columns, totals, tax summaries, terms, signatures, and receipt-specific invoice/bill information. Use these as product inspiration, not as evidence that FirmBooks supports the same categories or fields.

Reference: https://www.zoho.com/in/books/help/settings/templates.html

## Next Steps

1. Build an evidence matrix for all 44 template IDs that compares their actual server-rendered structure and the data fields available to each category. Implement purposeful, non-overlapping variants rather than relying on names or a shared generic layout.
2. Remove false catalog promises and wire each remaining setting to actual server-rendered behavior, using only authorized source data. Add field-level PDF assertions for each category/variant.
3. Expand live-PDF and edge-case verification, then run relevant repository tests, lint, and production build. Run PostgreSQL-backed checks with a disposable PostgreSQL database; never use production credentials.
4. Obtain a final independent Sol review of the actual patch. Keep the goal active until all category/variant requirements and required release gates are verified.

The current source inventory and earlier Sol architecture review are complete. Continue with the evidence matrix, visual audit, category-specific renderer improvements, and focused verification; preserve the full 14-category/44-variant objective.
