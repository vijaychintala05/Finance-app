export interface DomainErrorOptions {
  status?: number;
  retryable?: boolean;
  cause?: string;
  fix?: string;
  docUrl?: string;
  currentState?: unknown;
}

export class DomainError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly causeDetail?: string;
  public readonly fix?: string;
  public readonly docUrl?: string;
  public readonly currentState?: unknown;

  constructor(code: string, message: string, options: DomainErrorOptions = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = options.status ?? 400;
    this.retryable = options.retryable ?? false;
    this.causeDetail = options.cause;
    this.fix = options.fix;
    this.docUrl = options.docUrl;
    this.currentState = options.currentState;
  }
}

export function conflictError(code: string, message: string, currentState?: unknown): DomainError {
  return new DomainError(code, message, { status: 409, currentState });
}

export function validationError(code: string, message: string, fix?: string): DomainError {
  return new DomainError(code, message, { status: 422, fix });
}
