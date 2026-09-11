import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ManualJournalService } from '../services/ManualJournalService';
import { ReportExportService } from '../services/ReportExportService';
import { newId } from '../utils/ids';

describe('Production Hardening: Batch 4 - Governance, Control Account Guard & Export Sanitization', () => {
  const ORG_ID = 'org-hardening-batch4';
  const USER_ID = 'usr-hardening-batch4';

  let controlAccId: string;
  let restrictedAccId: string;
  let regularExpAccId: string;
  let regularBankAccId: string;

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user and organization
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'batch4_tester@firmbooks.io', 'hashed_pass', 'Batch 4 Tester', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-batch4', 'pub-b4', 'B4ORG', 'Batch 4 Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // 2. Seed accounts
    controlAccId = newId('acc');
    restrictedAccId = newId('acc');
    regularExpAccId = newId('acc');
    regularBankAccId = newId('acc');

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, system_role, balance, status, allow_direct_posting)
       VALUES 
         ($1, $5, '1200', 'Accounts Receivable Control', 'Asset', 'Accounts Receivable', 'AR_CONTROL', 0, 'Active', false),
         ($2, $5, '6999', 'Restricted Reserve', 'Expense', 'Operating Expense', NULL, 0, 'Active', false),
         ($3, $5, '5100', 'Office Supplies', 'Expense', 'Operating Expense', NULL, 0, 'Active', true),
         ($4, $5, '1050', 'Petty Cash', 'Asset', 'Cash', NULL, 0, 'Active', true)`,
      [controlAccId, restrictedAccId, regularExpAccId, regularBankAccId, ORG_ID]
    );
  });

  it('1. Rejects manual journal entries to control accounts (AR / AP)', async () => {
    await expect(
      ManualJournalService.createJournal(ORG_ID, USER_ID, {
        date: '2026-09-08',
        reference: 'ADJ-CTRL-01',
        lines: [
          { accountId: controlAccId, debit: 5000, credit: 0 },
          { accountId: regularBankAccId, debit: 0, credit: 5000 },
        ],
      })
    ).rejects.toThrow();
  });

  it('2. Rejects manual journal entries to accounts where allow_direct_posting is false', async () => {
    await expect(
      ManualJournalService.createJournal(ORG_ID, USER_ID, {
        date: '2026-09-08',
        reference: 'ADJ-REST-01',
        lines: [
          { accountId: restrictedAccId, debit: 2000, credit: 0 },
          { accountId: regularBankAccId, debit: 0, credit: 2000 },
        ],
      })
    ).rejects.toThrow('JOURNAL_DIRECT_POSTING_RESTRICTED');
  });

  it('3. Accepts balanced manual journals between accounts where allow_direct_posting is true', async () => {
    const journal = await ManualJournalService.createJournal(ORG_ID, USER_ID, {
      date: '2026-09-08',
      reference: 'ADJ-OK-01',
      narration: 'Office expense replenishment',
      lines: [
        { accountId: regularExpAccId, debit: 1500, credit: 0 },
        { accountId: regularBankAccId, debit: 0, credit: 1500 },
      ],
    });

    expect(journal.id).toBeDefined();
    expect(journal.status).toBe('Posted');
  });

  it('4. ReportExportService.sanitizeCsvValue neutralizes all dangerous CSV formula triggers', () => {
    expect(ReportExportService.sanitizeCsvValue('=1+1')).toBe("'=1+1");
    expect(ReportExportService.sanitizeCsvValue('+cmd|/C calc')).toBe("'+cmd|/C calc");
    expect(ReportExportService.sanitizeCsvValue('-100')).toBe("'-100");
    expect(ReportExportService.sanitizeCsvValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    expect(ReportExportService.sanitizeCsvValue('\tTabInjection')).toBe("'\tTabInjection");
    expect(ReportExportService.sanitizeCsvValue('\rReturnInjection')).toBe("'\rReturnInjection");

    // Safe values must remain untouched
    expect(ReportExportService.sanitizeCsvValue('Acme Corporation')).toBe('Acme Corporation');
    expect(ReportExportService.sanitizeCsvValue('INV-2026-001')).toBe('INV-2026-001');
    expect(ReportExportService.sanitizeCsvValue('15000.00')).toBe('15000.00');
  });

  it('5. ReportExportService.convertToCSV applies formula sanitization across all columns', () => {
    const rows = [
      {
        account: '=SUM(B1:B10)',
        description: 'Vendor + Partner',
        amount: '-500.00',
        cleanText: 'Standard Note',
      },
    ];

    const csv = ReportExportService.convertToCSV(rows);
    expect(csv).toContain('"\'=SUM(B1:B10)"');
    expect(csv).toContain('"Vendor + Partner"');
    expect(csv).toContain('"\' -500.00"'.replace(' ', ''));
    expect(csv).toContain('"Standard Note"');
  });

  it('6. PostgreSQL schema migration includes prevent_posted_journal_mutation trigger', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(__dirname, '../database/migrationRunner.ts');
    const content = fs.readFileSync(migrationPath, 'utf-8');

    expect(content).toContain('prevent_posted_journal_mutation');
    expect(content).toContain('journal_entries_posted_immutable');
    expect(content).toContain('reversal_of_journal_id');

    const enterprisePath = path.resolve(__dirname, '../database/enterpriseHardeningSchema.ts');
    const enterpriseContent = fs.readFileSync(enterprisePath, 'utf-8');
    expect(enterpriseContent).toContain('reversal_of_journal_id');
  });
});
