export interface FinancialCommandErrorResponse {
  status: number;
  body: {
    code: string;
    error: string;
    recovery: string;
  };
}

const RECOVERY_BY_CODE: Record<string, { status: number; recovery: string }> = {
  COMMAND_IDEMPOTENCY_CONFLICT: { status: 409, recovery: 'Reload the record and submit the corrected change as a new action.' },
  COMMAND_IN_PROGRESS: { status: 409, recovery: 'Do not submit again. Wait briefly, then reload to check the recorded result.' },
  PERIOD_LOCKED: { status: 409, recovery: 'Use an open posting date or ask an authorized accountant to reopen the period.' },
  DUPLICATE_IMPORT: { status: 409, recovery: 'Review the existing statement import instead of uploading the same rows again.' },
  ALREADY_MATCHED: { status: 409, recovery: 'Open the existing match or reverse it before taking another action.' },
  EXPENSE_INPUT_INVALID: { status: 400, recovery: 'Correct the highlighted expense details and submit once.' },
  EXPENSE_RECEIPT_INVALID: { status: 400, recovery: 'Use a supported receipt image within the permitted size and try again.' },
  EXPENSE_AMOUNT_MISMATCH: { status: 400, recovery: 'Make the expense total equal the sum of its itemized lines.' },
  EXPENSE_ITEM_INVALID: { status: 400, recovery: 'Give every item a valid account and a positive amount.' },
  EXPENSE_CUSTOMER_REQUIRED: { status: 400, recovery: 'Choose the customer that will be billed before recording this recoverable expense.' },
  EXPENSE_CUSTOMER_INVALID: { status: 400, recovery: 'Choose a customer that belongs to this organization before posting.' },
  EXPENSE_VENDOR_INVALID: { status: 400, recovery: 'Choose a vendor that belongs to this organization before posting.' },
  ACCOUNT_NOT_FOUND: { status: 404, recovery: 'Reload the page and choose an active account from this organization.' },
  ACCOUNT_INACTIVE: { status: 422, recovery: 'Choose an active account or reactivate it before posting.' },
  UNAUTHORIZED: { status: 403, recovery: 'Ask an organization owner or accountant for the required permission.' },
};

function codeFromError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const match = message.match(/^([A-Z][A-Z0-9_]+):/);
  return match?.[1] || 'FINANCIAL_COMMAND_FAILED';
}

function messageFromError(error: unknown, code: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (['EXPENSE_CUSTOMER_REQUIRED', 'EXPENSE_CUSTOMER_INVALID', 'EXPENSE_VENDOR_INVALID'].includes(code)) {
    return message.trim();
  }
  const withoutCode = message.replace(new RegExp(`^${code}:\\s*`), '').trim();
  return withoutCode || 'This financial action could not be completed.';
}

/** Maps known finance failures to a stable, safe contract for web and mobile clients. */
export function toFinancialCommandError(error: unknown): FinancialCommandErrorResponse {
  const code = codeFromError(error);
  const definition = RECOVERY_BY_CODE[code] || {
    status: 422,
    recovery: 'Reload the record before retrying. If the issue continues, share this error code with your accountant.',
  };
  return {
    status: definition.status,
    body: {
      code,
      error: messageFromError(error, code),
      recovery: definition.recovery,
    },
  };
}
