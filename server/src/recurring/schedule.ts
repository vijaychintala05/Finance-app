import { createHash } from 'node:crypto';
import { RecurringTransactionError } from './RecurringTransactionError';
import type {
  CreateRecurringProfileInput,
  RecurringCatchUpPolicy,
  RecurringFrequency,
  RecurringTransactionKind,
} from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TEMPLATE_BYTES = 262_144;

export function assertIsoDate(value: string, fieldName: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) fail(`${fieldName} must use YYYY-MM-DD format`);
  const year = Number(match![1]);
  const month = Number(match![2]);
  const day = Number(match![3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) fail(`${fieldName} must be a real calendar date`);
  return value;
}

export function occurrenceKey(
  organizationId: string,
  profileId: string,
  scheduledFor: string
): string {
  assertIdentifier(organizationId, 'organizationId');
  assertIdentifier(profileId, 'profileId');
  assertIsoDate(scheduledFor, 'scheduledFor');
  return createHash('sha256')
    .update(`recurring:v1:${organizationId}:${profileId}:${scheduledFor}`, 'utf8')
    .digest('hex');
}

export function nextScheduleDate(
  current: string,
  frequency: RecurringFrequency,
  intervalCount: number,
  anchorDay: number
): string {
  assertIsoDate(current, 'current schedule date');
  assertIntegerRange(intervalCount, 1, 365, 'intervalCount');
  assertIntegerRange(anchorDay, 1, 31, 'anchorDay');
  const [year, month, day] = current.split('-').map(Number);

  if (frequency === 'DAILY') return addUtcDays(year, month, day, intervalCount);
  if (frequency === 'WEEKLY') return addUtcDays(year, month, day, intervalCount * 7);

  const monthStep = frequency === 'MONTHLY'
    ? intervalCount
    : frequency === 'QUARTERLY'
      ? intervalCount * 3
      : frequency === 'YEARLY'
        ? intervalCount * 12
        : fail('frequency is invalid');
  const absoluteMonth = year * 12 + (month - 1) + monthStep;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  const targetDay = Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
  return formatDate(targetYear, targetMonth, targetDay);
}

export function dueDatesForPolicy(input: {
  nextRunDate: string;
  asOfDate: string;
  endDate: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  anchorDay: number;
  catchUpPolicy: RecurringCatchUpPolicy;
  maxCatchUp: number;
}): { materialize: string[]; nextRunDate: string } {
  assertIsoDate(input.nextRunDate, 'nextRunDate');
  assertIsoDate(input.asOfDate, 'asOfDate');
  if (input.endDate) assertIsoDate(input.endDate, 'endDate');
  assertIntegerRange(input.maxCatchUp, 1, 100, 'maxCatchUp');

  const isDue = (date: string) => date <= input.asOfDate && (!input.endDate || date <= input.endDate);
  if (!isDue(input.nextRunDate)) return { materialize: [], nextRunDate: input.nextRunDate };

  const advance = (date: string) => nextScheduleDate(
    date,
    input.frequency,
    input.intervalCount,
    input.anchorDay
  );

  if (input.catchUpPolicy === 'ALL') {
    const materialize: string[] = [];
    let cursor = input.nextRunDate;
    while (isDue(cursor) && materialize.length < input.maxCatchUp) {
      materialize.push(cursor);
      cursor = advance(cursor);
    }
    return { materialize, nextRunDate: cursor };
  }

  let latest = input.nextRunDate;
  let cursor = advance(latest);
  let guard = 0;
  while (isDue(cursor)) {
    latest = cursor;
    cursor = advance(cursor);
    guard += 1;
    if (guard > 100_000) fail('schedule catch-up exceeds the safety limit');
  }
  if (input.catchUpPolicy === 'LATEST') return { materialize: [latest], nextRunDate: cursor };
  return {
    materialize: latest === input.asOfDate ? [latest] : [],
    nextRunDate: cursor,
  };
}

export function retryDelaySeconds(
  attemptCount: number,
  baseDelaySeconds: number,
  maxDelaySeconds: number
): number {
  assertIntegerRange(attemptCount, 1, 100, 'attemptCount');
  assertIntegerRange(baseDelaySeconds, 1, 86_400, 'baseDelaySeconds');
  assertIntegerRange(maxDelaySeconds, baseDelaySeconds, 604_800, 'maxDelaySeconds');
  return Math.min(maxDelaySeconds, baseDelaySeconds * (2 ** Math.min(attemptCount - 1, 30)));
}

export function validateCreateProfileInput(input: CreateRecurringProfileInput): Required<
  Omit<CreateRecurringProfileInput, 'endDate'>
> & { endDate: string | null; anchorDay: number } {
  if (!input || typeof input !== 'object') fail('profile input is required');
  const organizationId = assertIdentifier(input.organizationId, 'organizationId');
  const createdBy = assertIdentifier(input.createdBy, 'createdBy');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 160) fail('name must contain 1-160 characters');

  const kinds: RecurringTransactionKind[] = ['INVOICE', 'BILL', 'EXPENSE'];
  if (!kinds.includes(input.kind)) fail('kind must be INVOICE, BILL, or EXPENSE');
  const frequencies: RecurringFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
  if (!frequencies.includes(input.frequency)) fail('frequency is invalid');

  const intervalCount = input.intervalCount ?? 1;
  assertIntegerRange(intervalCount, 1, 365, 'intervalCount');
  const startDate = assertIsoDate(input.startDate, 'startDate');
  const endDate = input.endDate ? assertIsoDate(input.endDate, 'endDate') : null;
  if (endDate && endDate < startDate) fail('endDate cannot precede startDate');

  const timezone = input.timezone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    fail('timezone must be a valid IANA timezone');
  }

  const catchUpPolicy = input.catchUpPolicy ?? 'ALL';
  if (!(['ALL', 'LATEST', 'SKIP'] as RecurringCatchUpPolicy[]).includes(catchUpPolicy)) {
    fail('catchUpPolicy must be ALL, LATEST, or SKIP');
  }
  const maxCatchUp = input.maxCatchUp ?? 12;
  assertIntegerRange(maxCatchUp, 1, 100, 'maxCatchUp');
  if (!isPlainObject(input.template)) fail('template must be a plain JSON object');
  let serialized: string;
  try {
    serialized = JSON.stringify(input.template);
  } catch {
    fail('template must be JSON serializable');
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_TEMPLATE_BYTES) {
    fail(`template cannot exceed ${MAX_TEMPLATE_BYTES} bytes`);
  }

  return {
    organizationId,
    createdBy,
    name,
    kind: input.kind,
    frequency: input.frequency,
    intervalCount,
    startDate,
    endDate,
    timezone,
    catchUpPolicy,
    maxCatchUp,
    template: JSON.parse(serialized),
    autoPost: input.autoPost === true,
    anchorDay: Number(startDate.slice(8, 10)),
  };
}

function addUtcDays(year: number, month: number, day: number, amount: number): string {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function assertIdentifier(value: string, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 128) fail(`${fieldName} must contain 1-128 characters`);
  return normalized;
}

function assertIntegerRange(value: number, min: number, max: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${fieldName} must be an integer between ${min} and ${max}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message: string): never {
  throw new RecurringTransactionError('RECURRING_VALIDATION_ERROR', message);
}

