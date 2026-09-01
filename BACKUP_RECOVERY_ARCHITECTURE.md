# FirmBooks Backup & Disaster Recovery Architecture

## System Inventory, Recovery Mechanisms, RPO/RTO & Operational Design

---

## 1. System Inventory & Architecture Overview

FirmBooks provides a two-tier backup and recovery architecture designed for self-hosted NAS, private cloud, and PostgreSQL enterprise deployments:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             FirmBooks Backup Architecture                        │
├───────────────────────────────────────┬──────────────────────────────────────────┤
│    Tier 1: Tenant & Snapshot Engine   │      Tier 2: Point-1 Sealed Recovery     │
│       (`BackupRestoreService.ts`)     │       (`RecoveryArtifactService.ts`)     │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ • Full tenant entity extraction       │ • Sealed artifact JSON envelope          │
│ • Deterministic table serialization   │ • AES-256-GCM payload encryption         │
│ • SHA-256 integrity checksums         │ • HMAC-SHA256 tampering authentication   │
│ • Transactional relational restore    │ • Isolated staging namespace             │
│ • Tenant-scoped & full-system backup  │ • Pre-promotion reconciliation checks    │
│ • Native audit trail integration      │ • Atomic promotion & rollback safety     │
└───────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 2. Component Inventory

| Component | Implementation File | Status | Mechanism / Capabilities |
| :--- | :--- | :---: | :--- |
| **Backup Engine** | [`BackupRestoreService.ts`](file:///c:/Users/HI/Desktop/APP/finance%20app/server/src/database/BackupRestoreService.ts) | ✅ Active | Extracts 45+ relational tenant tables, computes SHA-256 payload checksum, stores in `backups` table. |
| **Point-1 Recovery Engine** | [`RecoveryArtifactService.ts`](file:///c:/Users/HI/Desktop/APP/finance%20app/server/src/recovery/RecoveryArtifactService.ts) | ✅ Active | Creates sealed, encrypted (`AES-256-GCM`), HMAC-authenticated recovery envelopes with manifest and schema version. |
| **PostgreSQL Backup** | `pg_dump` / SQL export adapter | ✅ Supported | Native PostgreSQL full physical/logical dump (`pg_dump -Fc` or JSON snapshot). |
| **Integrity Checksums** | `crypto.createHash('sha256')` | ✅ Active | SHA-256 hex digest computed across normalized, serialized table records. Tampering detection on restore. |
| **Encryption** | `AES-256-GCM` via Keyring | ✅ Active (Point-1) | 256-bit encryption key with random 96-bit IV and 128-bit authentication tag. |
| **HMAC Authentication** | `HMAC-SHA256` | ✅ Active (Point-1) | Prevents envelope and manifest tampering prior to decryption. |
| **Staged Recovery** | `ProductionRecoveryAdapters.ts` | ✅ Active | Staged into isolated staging organization ID; audited and reconciled before promotion. |
| **Accounting Reconciliation** | `verifyOrganizationIntegrity` | ✅ Active | Enforces $\sum \text{Debits} \equiv \sum \text{Credits}$, AR/AP subledger agreement, and GST parity before promotion. |
| **Restore Authorization** | RBAC (`settings.backup`, Owner-only) | ✅ Active | Strictly restricted to Organization `Owner` role. Blocked for `Admin`, `Finance Manager`, `Accountant`, `Sales`, `Viewer`. |
| **Audit Logging** | `AuditTrailService.ts` | ✅ Active | Emits immutable audit log records with SHA-256 hash chaining on backup creation, validation, promotion, and failure. |
| **Attachment Storage** | NAS file system / local volume | ⚠️ Explicit Gap | Document attachments are stored in configured volume directory. Database records link to paths. File backup requires volume snapshot synchronization. |

---

## 3. Recovery Objectives

### RPO — Recovery Point Objective
- **Current Operational Capability**: **Periodic Manual & Scheduled Daily Snapshot (24-Hour RPO Baseline)**.
- **Transactional WAL Archiving (Optional High-Availability)**: When PostgreSQL `archive_mode = on` with continuous WAL archiving is configured on the host NAS, RPO is reduced to **< 5 minutes**.
- **Supported Reality**: FirmBooks does not claim real-time continuous replication out-of-the-box without PostgreSQL WAL configuration. Supported baseline RPO is based on the scheduled backup cadence (typically daily or hourly).

### RTO — Recovery Time Objective
- **Tested Restore Time**: **< 5 seconds** for small/medium business ledgers (1,000–5,000 transactions).
- **Projected Enterprise Restore Time**: **< 2 minutes** for 100,000+ journal records on standard SSD/NVMe NAS storage.
- **Clean Environment Provisioning**: Requires PostgreSQL instance startup + `MigrationRunner.runMigrations()` + backup restore execution.

---

## 4. Backup & Restore Data Flow

```text
[Live Database]
       │
       ▼ (createBackup / exportTenantData)
[Normalized JSON & SHA-256 Checksum]
       │
       ├──────────────────────────────────────────┐
       ▼                                          ▼
[backups Table / Downloadable Snapshot]   [Point-1 Sealed Artifact (AES-256-GCM)]
       │                                          │
═══════╪══════════════════════════════════════════╪═══════════════════════════════════════
       │ CATASTROPHIC EVENT: Database Destroyed   │
═══════╪══════════════════════════════════════════╪═══════════════════════════════════════
       │                                          │
[Fresh Database Instance]                 [Fresh Database Instance]
       │                                          │
       ▼ (verifyBackup SHA-256 Checksum)          ▼ (verify HMAC & Decrypt Envelope)
[Validate Checksum & Schema]              [Stage into Isolated Namespace]
       │                                          │
       ▼ (restoreBackup Transaction)              ▼ (Run Relational & GL Reconciliation)
[Populate 45+ Tables Atomically]          [Atomic Promotion to Active Org]
       │                                          │
       ▼                                          ▼
[All Financial Statements & Reports Match Pre-Loss Values: Δ = ₹0.00]
```

---

## 5. Explicit Recovery Classifications

1. **Relational Database Recovery**: **FULLY AUTOMATED & TESTED**.
2. **Settings, Roles, Approvals & Period Locks**: **FULLY AUTOMATED & TESTED**.
3. **Audit Log Hash Chain Continuity**: **FULLY AUTOMATED & TESTED**.
4. **External File Storage / Attachments**: **CLASSIFIED AS: `RECOVERY GAP — EXTERNAL FILE STORAGE`**.
   - FirmBooks records attachment metadata (`file_name`, `file_size`, `mime_type`, `storage_path`) in PostgreSQL.
   - Physical attachment binary files reside on the NAS volume directory.
   - Comprehensive disaster recovery requires pairing the database backup with the attachment volume directory snapshot.
