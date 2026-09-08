# Changelog

All notable changes to the FirmBooks finance application are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-08

### Added
- **Customer Portal**:
  - Secure tokenized access with SHA-256 token hashing at rest.
  - Public invoice payment checkout flow with instant GL journal generation.
  - SPA hash-routing support (`#customer_portal?portal_token=...`) with automated link sharing.
- **Stage 6 Usability & Document Hub**:
  - Centralized Document Inbox supporting file uploads, metadata extraction, and workflow routing.
  - Document OCR integration with structured invoice confidence scoring and fallback error handling.
  - Client-side form draft auto-save and crash recovery via `useFormDraft`.
  - Saved views, custom column configurations, and persistent grid filters.
- **Payment Gateway Webhooks**:
  - Native multi-gateway webhook support for Stripe and Razorpay.
  - Automatic subunit conversion (cents/paise to standard currency units) for gross amounts and processor fees.
  - Fail-closed HMAC-SHA256 signature verification and strict tenant isolation.
- **Bank Feeds & Job Workers**:
  - Bank feed synchronization provider infrastructure with AES-256-GCM credential encryption.
  - Background job scheduler with atomic row locking (`FOR UPDATE SKIP LOCKED`) and lease crash recovery.
- **Automated Integration Test Suite**:
  - Added 11 comprehensive automated integration tests in `qaRemediations.test.ts` covering payment normalization, bank feeds, job scheduling, migration opening balances, bank deletion guards, and sales order status.

### Fixed
- **Financial Posting & Rounding**:
  - Added floating-point epsilon tolerance (`0.009`) in Sales Engine invoice conversion to prevent fully paid orders from remaining stuck in `PARTIALLY_INVOICED`.
  - Enforced atomic audit log generation (`CREATE_VENDOR_REFUND`) inside the vendor refund transaction block.
- **Data Migration & Reconciliation**:
  - Synchronized `bank_accounts.current_balance` concurrently during opening balance journal postings.
  - Hardened bank account deletion safeguards to verify foreign key references against `vendor_refunds`.
- **Security & Route Hardening**:
  - Replaced fallback `'org-default'` in gateway webhooks with strict HTTP 400 validation for `organizationId`.
  - Enforced `APP_ENCRYPTION_KEY` environment requirement in production runtime mode.
  - Added vendor existence guard in Purchase Orders view to prevent creating POs without registered suppliers.

---

## [1.0.0] - 2026-09-01

### Added
- Core Double-Entry Accounting Engine with Chart of Accounts governance and period locks.
- Complete Invoicing, Sales Orders, Credit Notes, and Accounts Receivable (AR) pipeline.
- Vendor Bills, Purchase Orders, Debit Notes, and Accounts Payable (AP) pipeline.
- Banking & Bank Reconciliation with statement parsing and rule-based categorization.
- Real-time Financial Reporting: Profit & Loss, Balance Sheet, Cash Flow Statement, and Aging Reports.
- Multi-tier RBAC and identity management with session security.
