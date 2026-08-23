export type RecurringTransactionErrorCode =
  | 'RECURRING_VALIDATION_ERROR'
  | 'RECURRING_PROFILE_NOT_FOUND'
  | 'RECURRING_PROFILE_STATE_CONFLICT'
  | 'RECURRING_OCCURRENCE_NOT_FOUND'
  | 'RECURRING_CLAIM_LOST'
  | 'RECURRING_CREATOR_UNAVAILABLE';

export class RecurringTransactionError extends Error {
  public readonly code: RecurringTransactionErrorCode;

  public constructor(code: RecurringTransactionErrorCode, message: string) {
    super(message);
    this.name = 'RecurringTransactionError';
    this.code = code;
  }
}

