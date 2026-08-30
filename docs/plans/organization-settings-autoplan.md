# Autoplan: Enterprise Organization Settings & Workspace Profile

**Date:** 2026-08-30  
**Branch:** nas-deploy / main  
**Status:** PROPOSED FOR IMPLEMENTATION  
**Mode:** SELECTIVE EXPANSION (Organization Settings & Firm Profile)

---

## 1. Executive Review Gauntlet

| Phase | Lead Reviewer | Key Decisions & Findings |
|---|---|---|
| **CEO Review** | Founder/CEO | **APPROVED** — The settings panel currently lacks real organization configuration. Users must be able to manage business identity, tax credentials (GSTIN/PAN/Tax ID), official address, invoice numbering prefixes, default payment terms, and bank settlement details. |
| **Design Review** | Lead Designer | **APPROVED** — Introduce a top-tier **Organization Profile & Settings** section in the Settings panel with structured sub-cards (Business Details, Tax & Legal, Invoicing Defaults, Bank & Payment Instructions, Multi-Org Switcher). |
| **Engineering Review** | Principal Eng | **APPROVED** — Server-authoritative `organization_profiles` table with atomic transactional updates, strict tenant isolation via `auth.organizationId`, RBAC authorization (`Owner` / `Admin` or `settings.manage_organization`), and immutable audit logging. |
| **DX Review** | Dev Experience | **APPROVED** — Zero breaking changes to existing `organizations` table; additive migration runner script; full client-side validation; comprehensive unit and integration test coverage. |

---

## 2. Architecture & Data Model

### A. Database Schema (`organization_profiles`)
```sql
CREATE TABLE IF NOT EXISTS organization_profiles (
  organization_id VARCHAR(64) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  legal_name VARCHAR(255),
  trade_name VARCHAR(255),
  tax_id VARCHAR(50),
  gstin VARCHAR(50),
  pan VARCHAR(50),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(30),
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  fiscal_year_start VARCHAR(20) DEFAULT 'April',
  default_payment_terms VARCHAR(50) DEFAULT 'Net 30',
  invoice_prefix VARCHAR(20) DEFAULT 'INV-',
  estimate_prefix VARCHAR(20) DEFAULT 'EST-',
  po_prefix VARCHAR(20) DEFAULT 'PO-',
  bill_prefix VARCHAR(20) DEFAULT 'BILL-',
  logo_url TEXT,
  invoice_notes TEXT,
  bank_name VARCHAR(120),
  bank_account_number VARCHAR(60),
  bank_ifsc_swift VARCHAR(40),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### B. REST API Contracts
1. `GET /api/v1/organizations/current`
   - Returns merged organization metadata + profile details.
2. `PATCH /api/v1/organizations/current`
   - Atomically updates organization name, industry, legal identifiers, addresses, and defaults.
   - Logs `ORGANIZATION_PROFILE_UPDATED` in `audit_logs`.

---

## 3. UI Component Architecture

1. **`OrganizationSettings.tsx`**:
   - **Header**: Organization name, Public Org ID badge, verification status, and currency lock indicator.
   - **Section 1: Business Profile**: Organization Name, Legal Name, Trade Name, Industry, Corporate Email, Phone, Website.
   - **Section 2: Legal & Tax Identifiers**: Tax ID / GSTIN / PAN / VAT ID, Registered Business Address.
   - **Section 3: Invoicing & Fiscal Defaults**: Financial year start month, Invoice/Quote/PO prefixes, Default payment terms, Standard terms/notes.
   - **Section 4: Bank Settlement Details**: Company bank account, IFSC/SWIFT code for auto-inclusion on invoice templates.
2. **`SettingsView.tsx` Navigation**:
   - Elevate **Organization Settings** as the premier top option in `SETTINGS_ITEMS`.
   - Update overview search and navigation routing.
