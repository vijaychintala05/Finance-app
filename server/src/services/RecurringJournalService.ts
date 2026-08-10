import { db } from '../database/db';
import { ManualJournalService } from './ManualJournalService';

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
    const id = `rec-${Date.now()}`;
    await db.query(
      `INSERT INTO recurring_journal_profiles (id, organization_id, name, description, frequency, start_date, end_date, next_run_date, journal_template, auto_post, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        orgId,
        input.name,
        input.description || '',
        input.frequency,
        input.startDate,
        input.endDate || null,
        input.startDate,
        JSON.stringify(input.journalTemplate),
        input.autoPost || false,
        userId,
      ]
    );

    return { id, name: input.name, nextRunDate: input.startDate };
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
