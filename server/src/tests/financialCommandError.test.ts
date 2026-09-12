import { describe, expect, it } from 'vitest';
import { toFinancialCommandError } from '../accounting/FinancialCommandError';

describe('financial command error contract', () => {
  it('returns a safe, actionable conflict response for uncertain retries', () => {
    expect(toFinancialCommandError(new Error('COMMAND_IN_PROGRESS: command already exists'))).toEqual({
      status: 409,
      body: {
        code: 'COMMAND_IN_PROGRESS',
        error: 'command already exists',
        recovery: 'Do not submit again. Wait briefly, then reload to check the recorded result.',
      },
    });
  });

  it('does not expose a raw unexpected error as an implementation detail', () => {
    const response = toFinancialCommandError(new Error('database driver exploded'));
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('FINANCIAL_COMMAND_FAILED');
    expect(response.body.recovery).toContain('Reload the record');
  });
});
