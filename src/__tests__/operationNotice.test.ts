import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../api/client';
import { committedButStaleNotice, isUncertainMutationOutcome, mutationExceptionNotice, mutationFailureNotice } from '../utils/operationNotice';

describe('financial operation notices', () => {
  it('does not misclassify a deterministic 409 conflict as an unknown commit', () => {
    const response = {
      data: null,
      error: 'The period is locked',
      status: 409,
      errorCode: 'PERIOD_LOCKED',
      recovery: 'Choose an open posting date.',
      requestId: 'req-period-1',
    };

    expect(isUncertainMutationOutcome(response)).toBe(false);
    expect(mutationFailureNotice(response, { action: 'Posting' })).toEqual(expect.objectContaining({
      tone: 'error',
      title: 'Posting was not completed',
      recovery: 'Choose an open posting date.',
      requestId: 'req-period-1',
      errorCode: 'PERIOD_LOCKED',
    }));
  });

  it('treats network failures and commands still in progress as uncertain', () => {
    expect(isUncertainMutationOutcome({ data: null, error: 'offline', status: 500, errorCode: 'NETWORK_FAILURE' })).toBe(true);
    expect(isUncertainMutationOutcome({ data: null, error: 'pending', status: 409, errorCode: 'COMMAND_IN_PROGRESS' })).toBe(true);
  });

  it('marks committed-but-stale results without inviting a duplicate mutation', () => {
    expect(committedButStaleNotice('Payment posted, but the register is stale', 'The journal committed.', 'req-7')).toEqual({
      tone: 'warning',
      title: 'Payment posted, but the register is stale',
      message: 'The journal committed.',
      recovery: 'Do not submit it again; use Refresh to load the committed state.',
      requestId: 'req-7',
    });
  });

  it('preserves trace and recovery evidence thrown through a domain service', () => {
    const notice = mutationExceptionNotice(new ApiRequestError({
      data: null,
      error: 'Email provider timed out',
      status: 503,
      errorCode: 'EMAIL_TIMEOUT',
      recovery: 'Check delivery history before retrying.',
      requestId: 'req-email-9',
    }, 'Invoice email failed'), { action: 'Invoice email' });

    expect(notice).toEqual(expect.objectContaining({
      tone: 'warning',
      requestId: 'req-email-9',
      errorCode: 'EMAIL_TIMEOUT',
      recovery: 'Check delivery history before retrying.',
    }));
  });
});
