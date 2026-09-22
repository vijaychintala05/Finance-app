import { ApiRequestError, type ApiResponse } from '../api/client';

export type OperationNoticeTone = 'success' | 'warning' | 'error';

export interface OperationNotice {
  tone: OperationNoticeTone;
  title: string;
  message: string;
  recovery?: string;
  requestId?: string;
  errorCode?: string;
}

interface FailureNoticeOptions {
  action: string;
  failureTitle?: string;
  uncertainTitle?: string;
  failureRecovery?: string;
  uncertainRecovery?: string;
}

export function isUncertainMutationOutcome(response: ApiResponse<unknown>): boolean {
  if (response.errorCode === 'NETWORK_FAILURE' || response.errorCode === 'COMMAND_IN_PROGRESS') return true;
  return response.status >= 500;
}

export function mutationFailureNotice(
  response: ApiResponse<unknown>,
  options: FailureNoticeOptions
): OperationNotice {
  const uncertain = isUncertainMutationOutcome(response);
  const serverRecovery = response.recovery || response.fix;
  return {
    tone: uncertain ? 'warning' : 'error',
    title: uncertain
      ? options.uncertainTitle || `${options.action} could not be confirmed`
      : options.failureTitle || `${options.action} was not completed`,
    message: response.cause
      ? `${response.error || 'The action failed.'} Cause: ${response.cause}`
      : response.error || 'The server did not provide an error message.',
    recovery: serverRecovery || (uncertain
      ? options.uncertainRecovery || 'Reload the authoritative record before retrying; the action may already have committed.'
      : options.failureRecovery || 'Review the current record and correct the action before trying again.'),
    requestId: response.requestId,
    errorCode: response.errorCode,
  };
}

export function mutationExceptionNotice(
  error: unknown,
  options: FailureNoticeOptions
): OperationNotice {
  if (error instanceof ApiRequestError) return mutationFailureNotice(error.response, options);
  const message = error instanceof Error ? error.message : String(error || 'The action failed.');
  return mutationFailureNotice({
    data: null,
    error: message,
    status: 500,
    errorCode: 'CLIENT_OR_UNKNOWN_FAILURE',
  }, options);
}

export function committedButStaleNotice(
  title: string,
  message: string,
  requestId?: string
): OperationNotice {
  return {
    tone: 'warning',
    title,
    message,
    recovery: 'Do not submit it again; use Refresh to load the committed state.',
    requestId,
  };
}
