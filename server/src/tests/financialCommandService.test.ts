import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialCommandService } from '../accounting/FinancialCommandService';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('FinancialCommandService', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('commits one receipt and one outbox event while redacting receipt payload evidence', async () => {
    const execute = vi.fn(async () => ({ expenseId: 'exp-command-1', journalEntryId: 'jrn-command-1' }));
    const command = await FinancialCommandService.execute({
      organizationId: 'org-command-test',
      actorUserId: 'usr-command-test',
      commandType: 'expense.post',
      idempotencyKey: 'financial-command-key-0001',
      payload: {
        amount: 1250,
        receiptImages: [{ fileName: 'receipt.png', base64: 'must-not-be-stored' }],
      },
      execute,
      events: (result) => [{
        eventType: 'expense.posted',
        aggregateType: 'Expense',
        aggregateId: result.expenseId,
        payload: { expenseId: result.expenseId, journalEntryId: result.journalEntryId },
      }],
      evidenceLinks: (result) => [{
        sourceType: 'Expense',
        sourceId: result.expenseId,
        relationType: 'POSTED_TO',
        targetType: 'JournalEntry',
        targetId: result.journalEntryId,
      }],
    });

    expect(command.result).toEqual({ expenseId: 'exp-command-1', journalEntryId: 'jrn-command-1' });
    const receipt = await db.query(`SELECT payload, status, result FROM financial_commands WHERE id = $1`, [command.commandId]);
    expect(receipt.rows[0].status).toBe('COMPLETED');
    expect(JSON.stringify(receipt.rows[0].payload)).not.toContain('must-not-be-stored');
    expect(JSON.stringify(receipt.rows[0].payload)).toContain('[REDACTED]');

    const events = await db.query(`SELECT event_type, aggregate_id, status FROM financial_outbox_events WHERE command_id = $1`, [command.commandId]);
    expect(events.rows).toEqual([{ event_type: 'expense.posted', aggregate_id: 'exp-command-1', status: 'PENDING' }]);

    const evidence = await db.query(
      `SELECT source_type, relation_type, target_type, target_id
         FROM financial_evidence_links
        WHERE command_id = $1
        ORDER BY source_type ASC`,
      [command.commandId]
    );
    expect(evidence.rows).toEqual([
      expect.objectContaining({ source_type: 'Expense', relation_type: 'POSTED_TO', target_type: 'JournalEntry', target_id: 'jrn-command-1' }),
      expect.objectContaining({ source_type: 'FinancialCommand', relation_type: 'RESULTS_IN', target_type: 'Expense', target_id: 'exp-command-1' }),
    ]);
  });

  it('returns a completed command result on a direct idempotent retry without rerunning the mutation', async () => {
    const execute = vi.fn(async () => ({ expenseId: 'exp-command-2' }));
    const input = {
      organizationId: 'org-command-test',
      commandType: 'expense.post',
      idempotencyKey: 'financial-command-key-0002',
      payload: { amount: 99 },
      execute,
      events: (result: { expenseId: string }) => [{
        eventType: 'expense.posted',
        aggregateType: 'Expense',
        aggregateId: result.expenseId,
        payload: result,
      }],
    };

    const first = await FinancialCommandService.execute(input);
    const second = await FinancialCommandService.execute(input);

    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
    const receipts = await db.query(`SELECT id FROM financial_commands WHERE organization_id = $1`, ['org-command-test']);
    expect(receipts.rows).toHaveLength(1);
  });
});
