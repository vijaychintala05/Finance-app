import { db, type DbQueryClient } from '../database/db';
import { RecurringTransactionService } from '../recurring';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { JobSchedulerService, type BackgroundJob } from './JobSchedulerService';

export interface ProcessRecurringResult {
  materializedOccurrences: number;
  claimedOccurrences: number;
  successfulOccurrences: number;
  failedOccurrences: number;
  details: Array<{
    occurrenceId: string;
    kind: string;
    status: 'SUCCEEDED' | 'FAILED';
    documentId?: string;
    documentType?: string;
    error?: string;
  }>;
}

export class RecurringDocumentJobHandler {
  public static createService(workerUserId: string = 'system-job-runner') {
    return new RecurringTransactionService({
      creators: {
        INVOICE: async (context) => {
          const invoice = await SalesEngine.createAndPostInvoice(
            context.organizationId,
            {
              ...(context.template as any),
              issueDate: context.scheduledFor,
              dueDate: (context.template as any).dueDate || context.scheduledFor,
              createdBy: workerUserId,
            },
            context.client
          );
          await context.client.query(
            'UPDATE invoices SET source_occurrence_key = $1 WHERE organization_id = $2 AND id = $3',
            [context.occurrenceKey, context.organizationId, invoice.id]
          );
          return { documentId: invoice.id, documentType: 'INVOICE' };
        },
        BILL: async (context) => {
          const bill = await PurchasesEngine.createAndPostBill(
            context.organizationId,
            {
              ...(context.template as any),
              billDate: context.scheduledFor,
              dueDate: (context.template as any).dueDate || context.scheduledFor,
            },
            context.client
          );
          await context.client.query(
            'UPDATE bills SET source_occurrence_key = $1 WHERE organization_id = $2 AND id = $3',
            [context.occurrenceKey, context.organizationId, bill.id]
          );
          return { documentId: bill.id, documentType: 'BILL' };
        },
        EXPENSE: async (context) => {
          const expense = await ExpensePostingService.createAndPost(
            context.organizationId,
            workerUserId,
            {
              ...(context.template as any),
              date: context.scheduledFor,
              sourceOccurrenceKey: context.occurrenceKey,
            },
            context.client
          );
          return { documentId: expense.id, documentType: 'EXPENSE' };
        },
      },
    });
  }

  public static async processDue(input: {
    asOfDate?: string;
    organizationId?: string;
    workerId?: string;
    limit?: number;
  }): Promise<ProcessRecurringResult> {
    const asOfDate = input.asOfDate || new Date().toISOString().slice(0, 10);
    const workerId = input.workerId || 'recurring-worker';
    const limit = input.limit || 50;

    const recurringService = this.createService();

    // 1. Materialize any due occurrences from active profiles
    const matResult = await recurringService.materializeDueOccurrences({
      asOfDate,
      organizationId: input.organizationId,
      profileLimit: limit,
    });

    // 2. Atomically claim due occurrences with row leases
    const claims = await recurringService.claimDueOccurrences({
      workerId,
      limit,
      organizationId: input.organizationId,
    });

    let successfulCount = 0;
    let failedCount = 0;
    const details: ProcessRecurringResult['details'] = [];

    // 3. Execute each claim
    for (const claim of claims) {
      try {
        const res = await recurringService.executeClaim(claim);
        successfulCount++;
        details.push({
          occurrenceId: claim.id,
          kind: claim.kind,
          status: 'SUCCEEDED',
          documentId: res.documentId,
          documentType: res.documentType,
        });
      } catch (err: any) {
        failedCount++;
        details.push({
          occurrenceId: claim.id,
          kind: claim.kind,
          status: 'FAILED',
          error: err?.message || String(err),
        });
      }
    }

    return {
      materializedOccurrences: matResult.occurrenceCount,
      claimedOccurrences: claims.length,
      successfulOccurrences: successfulCount,
      failedOccurrences: failedCount,
      details,
    };
  }

  /**
   * Schedules a recurring document execution job in the durable JobSchedulerService.
   */
  public static async scheduleRecurringExecutionJob(
    orgId: string,
    asOfDate?: string,
    idempotencyKey?: string
  ): Promise<BackgroundJob> {
    return JobSchedulerService.scheduleJob(
      orgId,
      'RECURRING_DOCUMENT_EXECUTION',
      { asOfDate: asOfDate || new Date().toISOString().slice(0, 10) },
      {
        idempotencyKey: idempotencyKey || `recurring-run-${orgId}-${asOfDate || new Date().toISOString().slice(0, 10)}`,
        maxRetries: 3,
        backoffSeconds: 30,
      }
    );
  }
}
