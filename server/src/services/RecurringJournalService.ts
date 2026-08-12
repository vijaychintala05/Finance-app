import { db } from '../database/db';
import { ManualJournalService } from './ManualJournalService';
import { newId } from '../utils/ids';

export interface RecurringJournalProfileInput {
  name: string;
  description?: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  startDate: string;
  endDate?: string;
  journalTemplate: {
    reference?: string;
    narration?: string;
    lines: {
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
      projectId?: string;
    }[];
  };
  autoPost?: boolean;
}

export class RecurringJournalService {
  public static async createProfile(
    orgId: string,
    userId: string,
    input: RecurringJournalProfileInput
  ): Promise<any> {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160) {
      throw new Error('Recurring journal name is required and cannot exceed 160 characters');
    }
    if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(input.frequency)) throw new Error('Invalid recurring journal frequency');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.startDate || '')) || (input.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate))) {
      throw new Error('Recurring journal dates must be valid and end date cannot precede start date');
    }
    if (input.description && input.description.length > 4000) throw new Error('Recurring journal description cannot exceed 4000 characters');
    const lines = input.journalTemplate?.lines;
    if (!Array.isArray(lines) || lines.length < 2 || lines.length > 1000) throw new Error('Recurring journal template requires 2-1000 lines');
    let debitCents = 0;
    let creditCents = 0;
    for (const [index, line] of lines.entries()) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (!line.accountId || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit === 0) === (credit === 0) || Math.abs(debit * 100 - Math.round(debit * 100)) > 1e-7 || Math.abs(credit * 100 - Math.round(credit * 100)) > 1e-7) {
        throw new Error(`Recurring journal line ${index + 1} must contain one positive, two-decimal debit or credit`);
      }
      debitCents += Math.round(debit * 100);
      creditCents += Math.round(credit * 100);
    }
    if (debitCents === 0 || debitCents !== creditCents) throw new Error('Recurring journal template must be balanced');

    const id = newId('rec');
    await db.transaction(async (client) => {
      const checkedAccounts = new Set<string>();
      for (const line of lines) {
        if (!checkedAccounts.has(line.accountId)) {
          const account = await client.query(
            `SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
            [orgId, line.accountId]
          );
          if (account.rows.length !== 1) throw new Error(`Recurring journal account ${line.accountId} does not belong to this organization or is unavailable`);
          checkedAccounts.add(line.accountId);
        }
        if (line.projectId) {
          const project = await client.query(`SELECT id FROM projects WHERE organization_id = $1 AND id = $2`, [orgId, line.projectId]);
          if (project.rows.length !== 1) throw new Error(`Recurring journal project ${line.projectId} does not belong to this organization`);
        }
      }
      await client.query(
        `INSERT INTO recurring_journal_profiles (id, organization_id, name, description, frequency, start_date, end_date, next_run_date, journal_template, auto_post, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, orgId, input.name.trim(), input.description || '', input.frequency, input.startDate, input.endDate || null, input.startDate, JSON.stringify(input.journalTemplate), Boolean(input.autoPost), userId]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'RECURRING_JOURNAL_CREATED', 'RecurringProfile', $4, $5)`,
        [newId('aud'), orgId, userId, id, JSON.stringify({ name: input.name.trim(), frequency: input.frequency, autoPost: Boolean(input.autoPost) })]
      );
    });

    return { id, name: input.name.trim(), nextRunDate: input.startDate };
  }

  public static async getProfiles(orgId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM recurring_journal_profiles WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return res.rows;
  }

  public static async generateDueJournals(orgId: string, userId: string): Promise<any[]> {
    const todayStr = new Date().toISOString().split('T')[0];
    const profilesRes = await db.query(
      `SELECT * FROM recurring_journal_profiles WHERE organization_id = $1 AND status = 'ACTIVE' AND next_run_date <= $2`,
      [orgId, todayStr]
    );

    const generated: any[] = [];

    for (const profile of profilesRes.rows) {
      const template = typeof profile.journal_template === 'string' ? JSON.parse(profile.journal_template) : profile.journal_template;
      const status = profile.auto_post ? 'Posted' : 'Draft';

      const journal = await ManualJournalService.createJournal(orgId, userId, {
        date: profile.next_run_date,
        reference: template.reference || profile.name,
        narration: template.narration || `Recurring Journal: ${profile.name}`,
        lines: template.lines,
        status,
      });

      // Advance next_run_date
      const curDate = new Date(profile.next_run_date);
      if (profile.frequency === 'MONTHLY') {
        curDate.setMonth(curDate.getMonth() + 1);
      } else if (profile.frequency === 'QUARTERLY') {
        curDate.setMonth(curDate.getMonth() + 3);
      } else if (profile.frequency === 'YEARLY') {
        curDate.setFullYear(curDate.getFullYear() + 1);
      }
      const newNextRunDate = curDate.toISOString().split('T')[0];

      await db.query(
        `UPDATE recurring_journal_profiles SET next_run_date = $1 WHERE id = $2`,
        [newNextRunDate, profile.id]
      );

      generated.push({
        profileId: profile.id,
        profileName: profile.name,
        journalId: journal.id,
        entryNumber: journal.entryNumber,
        status,
      });
    }

    return generated;
  }
}
