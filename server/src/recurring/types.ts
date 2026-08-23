import type { DbQueryClient } from '../database/db';

export type RecurringTransactionKind = 'INVOICE' | 'BILL' | 'EXPENSE';
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type RecurringCatchUpPolicy = 'ALL' | 'LATEST' | 'SKIP';
export type RecurringProfileStatus = 'ACTIVE' | 'PAUSED';
export type RecurringOccurrenceStatus = 'PENDING' | 'PROCESSING' | 'RETRY' | 'SUCCEEDED' | 'QUARANTINED';

export interface CreateRecurringProfileInput {
  organizationId: string;
  name: string;
  kind: RecurringTransactionKind;
  frequency: RecurringFrequency;
  intervalCount?: number;
  startDate: string;
  endDate?: string;
  timezone?: string;
  catchUpPolicy?: RecurringCatchUpPolicy;
  maxCatchUp?: number;
  template: Record<string, unknown>;
  autoPost?: boolean;
  createdBy: string;
}

export interface RecurringProfile {
  id: string;
  organizationId: string;
  name: string;
  kind: RecurringTransactionKind;
  frequency: RecurringFrequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  anchorDay: number;
  timezone: string;
  catchUpPolicy: RecurringCatchUpPolicy;
  maxCatchUp: number;
  template: Record<string, unknown>;
  autoPost: boolean;
  status: RecurringProfileStatus;
}

export interface ClaimedOccurrence {
  id: string;
  organizationId: string;
  profileId: string;
  occurrenceKey: string;
  scheduledFor: string;
  kind: RecurringTransactionKind;
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: Date | string;
}

export interface RecurringDocumentResult {
  documentId: string;
  documentType?: string;
}

export interface RecurringDocumentContext {
  client: DbQueryClient;
  organizationId: string;
  profileId: string;
  occurrenceId: string;
  occurrenceKey: string;
  scheduledFor: string;
  template: Readonly<Record<string, unknown>>;
  autoPost: boolean;
}

export type RecurringDocumentCreator = (
  context: RecurringDocumentContext
) => Promise<RecurringDocumentResult>;

export type RecurringDocumentCreators = Record<RecurringTransactionKind, RecurringDocumentCreator>;

export interface RecurringDatabase {
  query: DbQueryClient['query'];
  transaction<T>(callback: (client: DbQueryClient) => Promise<T>): Promise<T>;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}

