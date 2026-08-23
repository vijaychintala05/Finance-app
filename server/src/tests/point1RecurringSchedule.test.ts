import { describe, expect, it } from 'vitest';
import {
  dueDatesForPolicy,
  nextScheduleDate,
  occurrenceKey,
  retryDelaySeconds,
  validateCreateProfileInput,
} from '../recurring';

describe('Point-1 recurring schedules', () => {
  it('generates stable tenant-scoped occurrence keys', () => {
    const first = occurrenceKey('org-a', 'profile-a', '2026-08-31');
    expect(first).toBe(occurrenceKey('org-a', 'profile-a', '2026-08-31'));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(occurrenceKey('org-b', 'profile-a', '2026-08-31'));
    expect(first).not.toBe(occurrenceKey('org-a', 'profile-a', '2026-09-30'));
  });

  it('preserves the monthly anchor across short months and leap years', () => {
    expect(nextScheduleDate('2026-01-31', 'MONTHLY', 1, 31)).toBe('2026-02-28');
    expect(nextScheduleDate('2026-02-28', 'MONTHLY', 1, 31)).toBe('2026-03-31');
    expect(nextScheduleDate('2028-01-31', 'MONTHLY', 1, 31)).toBe('2028-02-29');
    expect(nextScheduleDate('2024-02-29', 'YEARLY', 1, 29)).toBe('2025-02-28');
  });

  it('bounds ALL catch-up without advancing past unmaterialized work', () => {
    expect(dueDatesForPolicy({
      nextRunDate: '2026-01-31', asOfDate: '2026-05-31', endDate: null,
      frequency: 'MONTHLY', intervalCount: 1, anchorDay: 31,
      catchUpPolicy: 'ALL', maxCatchUp: 2,
    })).toEqual({
      materialize: ['2026-01-31', '2026-02-28'],
      nextRunDate: '2026-03-31',
    });
  });

  it('supports latest-only and skip-missed catch-up policies', () => {
    const common = {
      nextRunDate: '2026-01-15', asOfDate: '2026-04-15', endDate: null,
      frequency: 'MONTHLY' as const, intervalCount: 1, anchorDay: 15, maxCatchUp: 12,
    };
    expect(dueDatesForPolicy({ ...common, catchUpPolicy: 'LATEST' })).toEqual({
      materialize: ['2026-04-15'], nextRunDate: '2026-05-15',
    });
    expect(dueDatesForPolicy({ ...common, asOfDate: '2026-04-20', catchUpPolicy: 'SKIP' })).toEqual({
      materialize: [], nextRunDate: '2026-05-15',
    });
    expect(dueDatesForPolicy({ ...common, catchUpPolicy: 'SKIP' })).toEqual({
      materialize: ['2026-04-15'], nextRunDate: '2026-05-15',
    });
  });

  it('uses capped exponential retry delays', () => {
    expect([1, 2, 3, 4, 5].map((attempt) => retryDelaySeconds(attempt, 60, 500)))
      .toEqual([60, 120, 240, 480, 500]);
  });

  it('rejects invalid dates, intervals, ranges, timezones, and templates exactly', () => {
    const valid = {
      organizationId: 'org-a', createdBy: 'user-a', name: 'Monthly invoice',
      kind: 'INVOICE' as const, frequency: 'MONTHLY' as const,
      startDate: '2026-01-31', template: { customerId: 'customer-a', lines: [] },
    };
    expect(validateCreateProfileInput(valid).anchorDay).toBe(31);
    expect(() => validateCreateProfileInput({ ...valid, startDate: '2026-02-30' })).toThrow(/real calendar date/);
    expect(() => validateCreateProfileInput({ ...valid, intervalCount: 0 })).toThrow(/intervalCount/);
    expect(() => validateCreateProfileInput({ ...valid, endDate: '2025-12-31' })).toThrow(/cannot precede/);
    expect(() => validateCreateProfileInput({ ...valid, timezone: 'Mars\/Olympus' })).toThrow(/IANA/);
    expect(() => validateCreateProfileInput({ ...valid, template: [] as any })).toThrow(/plain JSON object/);
  });
});

