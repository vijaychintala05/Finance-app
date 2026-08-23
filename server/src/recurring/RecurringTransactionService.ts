import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { RecurringTransactionError } from './RecurringTransactionError';
import {
  assertIsoDate,
  dueDatesForPolicy,
  occurrenceKey,
  retryDelaySeconds,
  validateCreateProfileInput,
} from './schedule';
import type {
  ClaimedOccurrence,
  CreateRecurringProfileInput,
  RecurringDatabase,
  RecurringDocumentCreators,
  RecurringProfile,
  RetryPolicy,
} from './types';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelaySeconds: 60,
  maxDelaySeconds: 21_600,
};

interface ProfileRow {
  id: string;
  organization_id: string;
  name: string;
  kind: RecurringProfile['kind'];
  frequency: RecurringProfile['frequency'];
  interval_count: number | string;
  start_date: Date | string;
  end_date: Date | string | null;
  next_run_date: Date | string;
  anchor_day: number | string;
  timezone: string;
  catch_up_policy: RecurringProfile['catchUpPolicy'];
  max_catch_up: number | string;
  template: Record<string, unknown> | string;
  auto_post: boolean;
  status: RecurringProfile['status'];
}

interface ExecutionRow extends ProfileRow {
  occurrence_id: string;
  occurrence_key: string;
  scheduled_for: Date | string;
  attempt_count: number | string;
  lease_owner: string;
}

export class RecurringTransactionService {
  private readonly database: RecurringDatabase;
  private readonly creators: Partial<RecurringDocumentCreators>;
  private readonly retryPolicy: RetryPolicy;
  private readonly skipLocked: boolean;

  public constructor(options: {
    creators: Partial<RecurringDocumentCreators>;
    database?: RecurringDatabase;
    retryPolicy?: Partial<RetryPolicy>;
    skipLocked?: boolean;
  }) {
    this.database = options.database ?? db;
    this.creators = options.creators;
    this.skipLocked = options.skipLocked ?? (options.database ? true : !db.isMemoryMode());
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy };
    retryDelaySeconds(1, this.retryPolicy.baseDelaySeconds, this.retryPolicy.maxDelaySeconds);
    if (!Number.isInteger(this.retryPolicy.maxAttempts) || this.retryPolicy.maxAttempts < 1 || this.retryPolicy.maxAttempts > 100) {
      throw new RecurringTransactionError(
        'RECURRING_VALIDATION_ERROR',
        'retryPolicy.maxAttempts must be an integer between 1 and 100'
      );
    }
  }

  public async createProfile(input: CreateRecurringProfileInput, client?: DbQueryClient): Promise<RecurringProfile> {
    const value = validateCreateProfileInput(input);
    const id = newId('rtp');
    const execute = async (tx: DbQueryClient) => {
      const result = await tx.query<ProfileRow>(
        `INSERT INTO recurring_transaction_profiles (
           id, organization_id, name, kind, frequency, interval_count,
           start_date, end_date, next_run_date, anchor_day, timezone,
           catch_up_policy, max_catch_up, template, auto_post, status, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $7, $9, $10,
           $11, $12, $13::jsonb, $14, 'ACTIVE', $15
         )
         RETURNING *`,
        [
          id, value.organizationId, value.name, value.kind, value.frequency,
          value.intervalCount, value.startDate, value.endDate, value.anchorDay,
          value.timezone, value.catchUpPolicy, value.maxCatchUp,
          JSON.stringify(value.template), value.autoPost, value.createdBy,
        ]
      );
      if (result.rowCount !== 1) throw new Error('Recurring profile insert did not return one row');
      return mapProfile(result.rows[0]);
    };
    return client ? execute(client) : this.database.transaction(execute);
  }

  public async pauseProfile(organizationId: string, profileId: string): Promise<RecurringProfile> {
    return this.changeProfileStatus(organizationId, profileId, 'ACTIVE', 'PAUSED');
  }

  public async resumeProfile(organizationId: string, profileId: string): Promise<RecurringProfile> {
    return this.changeProfileStatus(organizationId, profileId, 'PAUSED', 'ACTIVE');
  }

  public async materializeDueOccurrences(input: {
    asOfDate: string;
    organizationId?: string;
    profileLimit?: number;
  }): Promise<{ profileCount: number; occurrenceCount: number; occurrenceIds: string[] }> {
    const asOfDate = assertIsoDate(input.asOfDate, 'asOfDate');
    const profileLimit = exactInteger(input.profileLimit ?? 50, 1, 500, 'profileLimit');
    const organizationId = input.organizationId?.trim() || null;

    return this.database.transaction(async (tx) => {
      const profiles = await tx.query<ProfileRow>(
        `SELECT *
           FROM recurring_transaction_profiles
          WHERE status = 'ACTIVE'
            AND next_run_date <= $1::date
            AND (end_date IS NULL OR next_run_date <= end_date)
            AND ($2::varchar IS NULL OR organization_id = $2)
          ORDER BY next_run_date ASC, organization_id ASC, id ASC
          LIMIT $3
          FOR UPDATE${this.skipLocked ? ' SKIP LOCKED' : ''}`,
        [asOfDate, organizationId, profileLimit]
      );

      const occurrenceIds: string[] = [];
      for (const row of profiles.rows) {
        const profile = mapProfile(row);
        const due = dueDatesForPolicy({
          nextRunDate: profile.nextRunDate,
          asOfDate,
          endDate: profile.endDate,
          frequency: profile.frequency,
          intervalCount: profile.intervalCount,
          anchorDay: profile.anchorDay,
          catchUpPolicy: profile.catchUpPolicy,
          maxCatchUp: profile.maxCatchUp,
        });

        for (const scheduledFor of due.materialize) {
          const id = newId('rto');
          const inserted = await tx.query<{ id: string }>(
            `INSERT INTO recurring_transaction_occurrences (
               id, organization_id, profile_id, occurrence_key, scheduled_for,
               kind, status, attempt_count, next_attempt_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, CURRENT_TIMESTAMP)
             ON CONFLICT (organization_id, occurrence_key) DO NOTHING
             RETURNING id`,
            [id, profile.organizationId, profile.id, occurrenceKey(profile.organizationId, profile.id, scheduledFor), scheduledFor, profile.kind]
          );
          if (inserted.rowCount === 1) occurrenceIds.push(inserted.rows[0].id);
        }

        const updated = await tx.query(
          `UPDATE recurring_transaction_profiles
              SET next_run_date = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE organization_id = $2 AND id = $3 AND status = 'ACTIVE'`,
          [due.nextRunDate, profile.organizationId, profile.id]
        );
        if (updated.rowCount !== 1) {
          throw new RecurringTransactionError('RECURRING_PROFILE_STATE_CONFLICT', `Profile ${profile.id} changed while materializing`);
        }
      }
      return { profileCount: profiles.rowCount, occurrenceCount: occurrenceIds.length, occurrenceIds };
    });
  }

  public async claimDueOccurrences(input: {
    workerId: string;
    limit?: number;
    leaseSeconds?: number;
    now?: Date;
    organizationId?: string;
  }): Promise<ClaimedOccurrence[]> {
    const workerId = exactText(input.workerId, 128, 'workerId');
    const limit = exactInteger(input.limit ?? 25, 1, 500, 'limit');
    const leaseSeconds = exactInteger(input.leaseSeconds ?? 300, 5, 3600, 'leaseSeconds');
    const now = input.now ?? new Date();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) validation('now must be a valid Date');
    const organizationId = input.organizationId?.trim() || null;

    return this.database.transaction(async (tx) => {
      if (!this.skipLocked) {
        // pg-mem does not implement UPDATE-from-CTE or SKIP LOCKED. Its
        // transaction adapter serializes writers, so this two-step path keeps
        // the same state transition for deterministic API tests only.
        const candidates = await tx.query<any>(
          `SELECT o.id, o.organization_id, o.profile_id, o.occurrence_key,
                  o.scheduled_for, o.kind, o.attempt_count
             FROM recurring_transaction_occurrences o
             JOIN recurring_transaction_profiles p
               ON p.organization_id = o.organization_id AND p.id = o.profile_id
            WHERE p.status = 'ACTIVE'
              AND ($1::varchar IS NULL OR o.organization_id = $1)
              AND ((o.status IN ('PENDING', 'RETRY') AND o.next_attempt_at <= $2)
                OR (o.status = 'PROCESSING' AND o.lease_expires_at <= $2))
            ORDER BY o.scheduled_for ASC, o.id ASC
            LIMIT $3
            FOR UPDATE`,
          [organizationId, now, limit]
        );
        const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
        const claims: ClaimedOccurrence[] = [];
        for (const row of candidates.rows) {
          const updated = await tx.query<any>(
            `UPDATE recurring_transaction_occurrences
                SET status = 'PROCESSING', attempt_count = attempt_count + 1,
                    lease_owner = $1, lease_expires_at = $2,
                    started_at = $3, updated_at = $3
              WHERE organization_id = $4 AND id = $5
              RETURNING id, organization_id, profile_id, occurrence_key,
                        scheduled_for, kind, attempt_count, lease_owner, lease_expires_at`,
            [workerId, leaseExpiresAt, now, row.organization_id, row.id]
          );
          if (updated.rowCount === 1) claims.push(mapClaim(updated.rows[0]));
        }
        return claims;
      }
      const result = await tx.query<any>(
        `WITH candidates AS (
           SELECT o.id
             FROM recurring_transaction_occurrences o
             JOIN recurring_transaction_profiles p
               ON p.organization_id = o.organization_id AND p.id = o.profile_id
            WHERE p.status = 'ACTIVE'
              AND ($1::varchar IS NULL OR o.organization_id = $1)
              AND (
                (o.status IN ('PENDING', 'RETRY') AND o.next_attempt_at <= $2)
                OR (o.status = 'PROCESSING' AND o.lease_expires_at <= $2)
              )
            ORDER BY o.scheduled_for ASC, o.id ASC
            LIMIT $3
            FOR UPDATE${this.skipLocked ? ' OF o SKIP LOCKED' : ''}
         )
         UPDATE recurring_transaction_occurrences o
            SET status = 'PROCESSING',
                attempt_count = o.attempt_count + 1,
                lease_owner = $4,
                lease_expires_at = $2 + ($5 * INTERVAL '1 second'),
                started_at = $2,
                updated_at = $2
           FROM candidates
          WHERE o.id = candidates.id
         RETURNING o.id, o.organization_id, o.profile_id, o.occurrence_key,
                   o.scheduled_for, o.kind, o.attempt_count, o.lease_owner,
                   o.lease_expires_at`,
        [organizationId, now, limit, workerId, leaseSeconds]
      );
      return result.rows.map(mapClaim);
    });
  }

  public async executeClaim(claim: ClaimedOccurrence): Promise<{ documentId: string; documentType: string }> {
    const creator = this.creators[claim.kind];
    if (!creator) {
      await this.recordFailure(claim, new RecurringTransactionError(
        'RECURRING_CREATOR_UNAVAILABLE',
        `No canonical ${claim.kind} creator is registered`
      ));
      throw new RecurringTransactionError('RECURRING_CREATOR_UNAVAILABLE', `No canonical ${claim.kind} creator is registered`);
    }

    try {
      return await this.database.transaction(async (tx) => {
        const locked = await tx.query<ExecutionRow>(
          `SELECT o.id AS occurrence_id, o.occurrence_key, o.scheduled_for,
                  o.attempt_count, o.lease_owner, p.*
             FROM recurring_transaction_occurrences o
             JOIN recurring_transaction_profiles p
               ON p.organization_id = o.organization_id AND p.id = o.profile_id
            WHERE o.organization_id = $1 AND o.id = $2
              AND o.status = 'PROCESSING' AND o.lease_owner = $3
              ${this.skipLocked ? 'AND o.lease_expires_at > CURRENT_TIMESTAMP' : ''}
            FOR UPDATE${this.skipLocked ? ' OF o' : ''}`,
          [claim.organizationId, claim.id, claim.leaseOwner]
        );
        if (locked.rowCount !== 1) {
          throw new RecurringTransactionError('RECURRING_CLAIM_LOST', `Claim for occurrence ${claim.id} is no longer owned`);
        }
        const row = locked.rows[0];
        const profile = mapProfile(row);
        const result = await creator({
          client: tx,
          organizationId: profile.organizationId,
          profileId: profile.id,
          occurrenceId: row.occurrence_id,
          occurrenceKey: row.occurrence_key,
          scheduledFor: toIsoDate(row.scheduled_for),
          template: Object.freeze({ ...profile.template }),
          autoPost: profile.autoPost,
        });
        const documentId = exactText(result?.documentId, 128, 'creator result documentId');
        const documentType = exactText(result.documentType ?? profile.kind, 64, 'creator result documentType');
        const updated = await tx.query(
          `UPDATE recurring_transaction_occurrences
              SET status = 'SUCCEEDED', document_id = $1, document_type = $2,
                  completed_at = CURRENT_TIMESTAMP, lease_owner = NULL,
                  lease_expires_at = NULL, last_error_code = NULL,
                  last_error_message = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = $3 AND id = $4
              AND status = 'PROCESSING' AND lease_owner = $5`,
          [documentId, documentType, claim.organizationId, claim.id, claim.leaseOwner]
        );
        if (updated.rowCount !== 1) {
          throw new RecurringTransactionError('RECURRING_CLAIM_LOST', `Claim for occurrence ${claim.id} was lost before completion`);
        }
        return { documentId, documentType };
      });
    } catch (error) {
      if (error instanceof RecurringTransactionError && error.code === 'RECURRING_CLAIM_LOST') throw error;
      await this.recordFailure(claim, error);
      throw error;
    }
  }

  public async retryQuarantined(organizationId: string, occurrenceId: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE recurring_transaction_occurrences
          SET status = 'RETRY', attempt_count = 0, next_attempt_at = CURRENT_TIMESTAMP,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1 AND id = $2 AND status = 'QUARANTINED'`,
      [exactText(organizationId, 128, 'organizationId'), exactText(occurrenceId, 128, 'occurrenceId')]
    );
    if (result.rowCount !== 1) {
      throw new RecurringTransactionError('RECURRING_OCCURRENCE_NOT_FOUND', 'Quarantined occurrence was not found');
    }
  }

  private async changeProfileStatus(
    organizationId: string,
    profileId: string,
    from: RecurringProfile['status'],
    to: RecurringProfile['status']
  ): Promise<RecurringProfile> {
    const result = await this.database.query<ProfileRow>(
      `UPDATE recurring_transaction_profiles
          SET status = $1,
              paused_at = CASE WHEN $1 = 'PAUSED' THEN CURRENT_TIMESTAMP ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE organization_id = $2 AND id = $3 AND status = $4
        RETURNING *`,
      [to, exactText(organizationId, 128, 'organizationId'), exactText(profileId, 128, 'profileId'), from]
    );
    if (result.rowCount !== 1) {
      throw new RecurringTransactionError(
        'RECURRING_PROFILE_STATE_CONFLICT',
        `Profile was not found or is not ${from}`
      );
    }
    return mapProfile(result.rows[0]);
  }

  private async recordFailure(claim: ClaimedOccurrence, error: unknown): Promise<void> {
    const quarantined = claim.attemptCount >= this.retryPolicy.maxAttempts;
    const delay = retryDelaySeconds(
      Math.max(1, claim.attemptCount),
      this.retryPolicy.baseDelaySeconds,
      this.retryPolicy.maxDelaySeconds
    );
    const code = error instanceof RecurringTransactionError ? error.code : 'RECURRING_DOCUMENT_CREATION_FAILED';
    const message = error instanceof Error ? error.message : 'Unknown recurring document creation failure';
    await this.database.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE recurring_transaction_occurrences
            SET status = $1,
                next_attempt_at = CASE WHEN $1 = 'RETRY'
                  THEN CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second') ELSE NULL END,
                quarantined_at = CASE WHEN $1 = 'QUARANTINED' THEN CURRENT_TIMESTAMP ELSE NULL END,
                lease_owner = NULL, lease_expires_at = NULL,
                last_error_code = $3, last_error_message = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $5 AND id = $6
            AND status = 'PROCESSING' AND lease_owner = $7`,
        [quarantined ? 'QUARANTINED' : 'RETRY', delay, code, message.slice(0, 2000), claim.organizationId, claim.id, claim.leaseOwner]
      );
      if (result.rowCount !== 1) {
        throw new RecurringTransactionError('RECURRING_CLAIM_LOST', `Claim for occurrence ${claim.id} was lost while recording failure`);
      }
    });
  }
}

function mapProfile(row: ProfileRow): RecurringProfile {
  const template = typeof row.template === 'string' ? JSON.parse(row.template) : row.template;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    kind: row.kind,
    frequency: row.frequency,
    intervalCount: Number(row.interval_count),
    startDate: toIsoDate(row.start_date),
    endDate: row.end_date ? toIsoDate(row.end_date) : null,
    nextRunDate: toIsoDate(row.next_run_date),
    anchorDay: Number(row.anchor_day),
    timezone: row.timezone,
    catchUpPolicy: row.catch_up_policy,
    maxCatchUp: Number(row.max_catch_up),
    template,
    autoPost: Boolean(row.auto_post),
    status: row.status,
  };
}

function mapClaim(row: any): ClaimedOccurrence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    profileId: row.profile_id,
    occurrenceKey: row.occurrence_key,
    scheduledFor: toIsoDate(row.scheduled_for),
    kind: row.kind,
    attemptCount: Number(row.attempt_count),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
  };
}

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function exactText(value: unknown, max: number, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) validation(`${fieldName} must contain 1-${max} characters`);
  return normalized;
}

function exactInteger(value: number, min: number, max: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    validation(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function validation(message: string): never {
  throw new RecurringTransactionError('RECURRING_VALIDATION_ERROR', message);
}
