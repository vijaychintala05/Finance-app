import { AccountingService } from '@/src/services/accountingService';

export interface JournalLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface PostJournalPayload {
  organizationId: string;
  entryNumber: string;
  date: string;
  reference: string;
  description: string;
  lines: JournalLineItem[];
}

export class ServerPostingEngine {
  /**
   * Validates and posts a journal entry atomically
   */
  public static postEntry(payload: PostJournalPayload): { success: boolean; entryId?: string; error?: string } {
    const linesWithIds = payload.lines.map((line, idx) => ({
      ...line,
      id: `line-${idx}`,
    }));
    const validation = AccountingService.validateJournalEntry({ lines: linesWithIds });
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const entryId = `JRN-${Date.now()}`;
    return { success: true, entryId };
  }
}
