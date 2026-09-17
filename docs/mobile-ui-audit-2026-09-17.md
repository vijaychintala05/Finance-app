# Mobile UI audit — 17 September 2026

The application is a responsive web app, not a native iOS app. This pass uses publicly documented Zoho Books mobile patterns as a reference for navigation, quick creation, record lists, account summaries, and drill-downs. It does not claim pixel parity with Zoho's authenticated iOS screens. Public references: [Zoho Books mobile app](https://www.zoho.com/us/books/accounting-mobile-apps/), [iOS App Store listing](https://apps.apple.com/in/app/accounting-app-zoho-books/id710446064?platform=ipad), and [Zoho mobile invoicing guidance](https://help.zoho.com/portal/es/community/topic/accounting-on-the-go-series-12-effortless-invoicing-adding-unbilled-expenses-and-projects-on-the-go-with-zoho-books-mobile-app).

## Implemented mobile behavior

- The More drawer exposes module groups and their nested routes; the five-item bottom navigation remains available on phones. The drawer supports Escape and locks background scrolling. The iOS safe area is included in the viewport and bottom spacing.
- Opted-in record tables become labeled, readable cards below 768px. Desktop retains table structure. This covers banking, sales, purchases, accounting, projects, recurring transactions, document inbox, and settings lists.
- The mobile dashboard starts with an action queue, then financial position, create actions, posted performance, due documents, and posted expense accounts. It removes an invented cash-flow chart and guessed cash balance. Cash/bank values come from the dashboard's posted-ledger query; receivables/payables come from open documents and are labeled as such.
- The banking overview's Record Transaction action opens its form and requires explicit monetary and counter-account selection when no account context exists.
- Portal token entry stacks on narrow screens. Data migration account lines scroll horizontally with an instruction; its footer actions stack on phones.

## Coverage and evidence

- Browser audit: all 45 `src/App.tsx` route cases at 390px, including customer portal and data migration. No document-wide overflow or unlabeled record-card cells. The More drawer exposes Bank Reconciliation. At 1280px, the bills table and its header remain native table elements.
- Form-opening audit: client, vendor, invoice, expense, bill, purchase order, estimate, journal, and bank transaction. All nine opened at 390px without clipped controls. The audit did not submit or mutate financial records.
- Visual inspection: dashboard, customer portal, and data migration at 390px. The portal token input measures 316px; the migration table scrolls within a 322px container.
- Automated UI regression tests cover mobile record labels, navigation, dashboard data labeling/action routing, and banking account selection.
- Final verification: TypeScript lint and production build passed; the full repository suite passed 186 files and 1,384 tests (one file and three tests skipped by their existing setup).

## Limits

The route audit checks top-level screens and nine key forms; it does not certify every nested state, every permission role, real bank or payment data, or Safari on physical iPhone hardware. The development server uses an isolated in-memory database and does not touch NAS production data. Some finance modules are feature-gated and may show an unavailable state until their backend capability is enabled. The desktop dashboard layout was not redesigned in this pass.
