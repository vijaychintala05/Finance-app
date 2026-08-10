# ARCHITECTURE AUDIT REPORT — FINANCE APP (PHASE 1)

**Date**: August 2026  
**Auditor**: Lead Systems Architect  
**Project**: Finance App (FirmBooks / Sense Studios Design)  

---

## 1. Executive Summary

This architecture audit evaluates the current state of the Finance App frontend codebase prior to transitioning to a full-stack production architecture with a PostgreSQL database and centralized double-entry accounting engine.

Currently, the application operates as a full-featured Client-Side Single Page Application (SPA) driven by React 19, Vite, and a monolithic React Context (`BooksContext.tsx`, 2,240+ LOC) with state persisted directly to `localStorage`. While feature-rich across accounting, sales, purchases, banking, project accounting, and governance, the current architecture carries significant risks regarding **data integrity**, **accounting correctness**, **multi-tenant organization isolation**, and **scalability**.

---

## 2. Current Architecture & Data Flow Overview

```
                          [ React UI Layer ]
         (Dashboard, Invoices, Bills, COA, Banking, Projects)
                                  │
                                  ▼
                        [ BooksContext.tsx ]
         (Monolithic state holder, 2240+ LOC, 60+ handlers)
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [ In-Memory React State ]       [ useEffect Sync ]
        (invoices, accounts, ...)      (localStorage.setItem)
                                                  │
                                                  ▼
                                       [ Browser LocalStorage ]
```

### Data Flow Execution Sequence
1. **User Interaction**: User creates an Invoice, Bill, Journal Entry, or Payment in a UI Modal.
2. **Context Handler Call**: UI invokes a function provided by `useBooks()` (e.g. `addInvoice()`, `recordPayment()`).
3. **State Mutation**: The handler constructs an object, updates React state via `setInvoices()`, and directly mutates account balances inline where coded.
4. **LocalStorage Persistence**: A blanket `useEffect` hook serializes the entire state array into `localStorage` under keys like `firmbooks_state_v2_${orgId}`.

---

## 3. Storage Analysis & Data Mapping

| Entity Domain | Current Storage Mechanism | Storage Keys / Scoping | Persistence Risks |
| :--- | :--- | :--- | :--- |
| **Organizations** | `localStorage` | `firmbooks_organizations_v2` | No server authority; subject to browser quota/clearing |
| **Chart of Accounts** | `localStorage` | Embedded in `firmbooks_state_v2_${orgId}` | Balances updated via manual frontend arithmetic |
| **Sales (Invoices, Orders)** | `localStorage` | Embedded in `firmbooks_state_v2_${orgId}` | No transaction locking or database ACID guarantees |
| **Purchases (Bills, POs)** | `localStorage` | Embedded in `firmbooks_state_v2_${orgId}` | Missing atomic linking between PO -> Bill -> Payment |
| **Banking & Cash** | `localStorage` | Embedded in `firmbooks_state_v2_${orgId}` | Bank transactions not automatically reconciled via ledger |
| **Journal Entries** | `localStorage` | Embedded in `firmbooks_state_v2_${orgId}` | Balancing verified client-side only during submit |

---

## 4. Module Dependencies Matrix

```
[Sales / Invoices]  ───depends on───>  [Clients] & [Chart of Accounts] & [Projects]
[Purchases / Bills] ───depends on───>  [Vendors] & [Chart of Accounts] & [Projects]
[Payments Received] ───depends on───>  [Invoices] & [Bank/Cash Accounts]
[Payments Made]     ───depends on───>  [Bills] & [Bank/Cash Accounts]
[Time Entries]      ───depends on───>  [Projects] & [Clients]
[Reports Engine]    ───depends on───>  [Invoices] & [Bills] & [Expenses] & [Journals]
```

---

## 5. Audit Findings & Risk Classification

### [CRITICAL] 🔴 Risk Findings

1. **Lack of Centralized Double-Entry Accounting Engine**:
   - *Issue*: Invoices, Bills, and Payments adjust status or account balances via ad-hoc client-side code blocks rather than emitting immutable double-entry journal postings (Debit / Credit pairs).
   - *Impact*: Financial reports (Balance Sheet, Profit & Loss, Trial Balance) can easily drift out of sync with actual invoices and expenses if state is updated partially or interrupted.

2. **No Data Atomicity or Transaction Rollbacks**:
   - *Issue*: If an error occurs midway through recording a Payment (e.g. updating Invoice status succeeds but updating Bank balance fails), the application is left in an inconsistent state.
   - *Impact*: Corruption of financial records with no rollback mechanism.

3. **Multi-Organization Data Leakage Hazard**:
   - *Issue*: Organization switching relies on React state (`currentOrg.id`). Sub-entities in seed data or dynamically created records do not consistently enforce an `organizationId` foreign key at the data structure level.
   - *Impact*: In a multi-tenant backend environment, one organization could query or modify records belonging to another tenant.

4. **Security & Authentication Absence**:
   - *Issue*: Current identity management (`currentUser`) is stored in client memory/localStorage with zero token verification (JWT, OAuth) or server-side authorization middleware.
   - *Impact*: Any client can impersonate an Admin or access restricted accounting settings by editing localStorage or React DevTools state.

---

### [HIGH] 🟠 Risk Findings

5. **Monolithic State & Context Bloat (`BooksContext.tsx`)**:
   - *Issue*: A single file (`BooksContext.tsx`) manages 25+ entity domains and 80+ state updater methods.
   - *Impact*: Re-renders the entire application on any minor state change, leading to performance degradation as transaction volume grows. Hard to test and maintain.

6. **Floating-Point Currency Arithmetic**:
   - *Issue*: Standard JavaScript floating-point numbers (`number`) are used for currency values (`amount`, `totalAmount`, `taxAmount`).
   - *Impact*: Floating-point rounding errors (e.g. `0.1 + 0.2 = 0.30000000000000004`) cause fractional cent discrepancies in tax calculations and financial statements.

7. **Soft Foreign Key Dependencies & Orphaned Records**:
   - *Issue*: Deleting a Client, Vendor, or Project does not cascade-check or prevent deletion if linked to open Invoices, Bills, or Time Entries.
   - *Impact*: Broken reference pointers (`clientId` pointing to non-existent client), causing rendering errors or missing customer details on invoices.

8. **Period Lock Enforcement Bypasses**:
   - *Issue*: Period locking checks are performed in UI modal components rather than enforced at the data repository / service layer.
   - *Impact*: API requests or programmatic context calls can write transactions into closed financial periods.

---

### [MEDIUM] 🟡 Risk Findings

9. **Duplicate Business Logic Across UI Modals**:
   - *Issue*: Calculations for subtotal, discount, tax, item total, and outstanding balances are duplicated inside `InvoiceEditorModal.tsx`, `InvoicesView.tsx`, `EstimateDetailsModal.tsx`, and `SalesOrderDetailsModal.tsx`.
   - *Impact*: Inconsistent calculations if bug fixes are applied to one modal but missed in another.

10. **Unchecked Data Imports & Exports**:
    - *Issue*: `importDataJSON` parses raw JSON input without schema validation or type sanitization before replacing the application state.
    - *Impact*: Malformed JSON can corrupt application state or inject unexpected parameters.

11. **Oversized Component Files**:
    - *Issue*: `DashboardView.tsx` (1,665 LOC), `InvoiceEditorModal.tsx` (613 LOC), `ReportsView.tsx` (1,200+ LOC).
    - *Impact*: Exceeds single-responsibility design principles; high cognitive load and code maintenance friction.

---

### [LOW] 🟢 Risk Findings

12. **Inconsistent Naming Conventions across Seed Data**:
    - *Issue*: `accountName`, `accountCode`, `accountId` used interchangeably across Expense, Bill, and Invoice line items.
    - *Impact*: Minor developer confusion when mapping fields across services.

---

## 6. Recommended Final Architecture Plan

To transition this application into a production-grade enterprise accounting platform, we implement a **Clean Layered Architecture**:

```
 ┌─────────────────────────────────────────────────────────┐
 │                       React UI                          │
 └───────────────────────────┬─────────────────────────────┘
                             │
 ┌───────────────────────────▼─────────────────────────────┐
 │       Domain Contexts (SalesContext, AccountingContext)  │
 └───────────────────────────┬─────────────────────────────┘
                             │
 ┌───────────────────────────▼─────────────────────────────┐
 │    Application Services (salesService, accountingEngine) │
 └───────────────────────────┬─────────────────────────────┘
                             │
 ┌───────────────────────────▼─────────────────────────────┐
 │      Repositories Layer (LocalStorageAdapter / API)     │
 └───────────────────────────┬─────────────────────────────┘
                             │
 ┌───────────────────────────▼─────────────────────────────┐
 │               Express REST API Backend                  │
 │      (Controllers ──> Services ──> Double Entry)        │
 └───────────────────────────┬─────────────────────────────┘
                             │
 ┌───────────────────────────▼─────────────────────────────┐
 │                PostgreSQL Database                      │
 └─────────────────────────────────────────────────────────┘
```

### Action Items for Phase 1 Implementation
1. **Data Access Abstraction**: Establish Repository Pattern (`src/repositories/`) and Domain Services (`src/services/`).
2. **Context Refactoring**: Split `BooksContext.tsx` into domain contexts while retaining `useBooks()` facade for backward compatibility.
3. **Double-Entry Engine Blueprint**: Document double-entry rules in `docs/ACCOUNTING_ENGINE.md`.
4. **Organization Multi-Tenant Tagging**: Update entity types with mandatory `organizationId`.
5. **Express Server Structure**: Scaffold `server/src/` with controllers, routes, accounting engine, middleware, and DB schemas.
6. **Automated Unit Tests**: Implement unit test suite with `vitest` verifying financial calculations, period locks, and payment allocations.
