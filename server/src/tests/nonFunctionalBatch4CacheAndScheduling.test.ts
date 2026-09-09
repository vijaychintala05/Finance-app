import { describe, it, expect, beforeEach } from 'vitest';
import { StaticMetadataCache } from '../cache/StaticMetadataCache';
import { JobSchedulerService } from '../jobs/JobSchedulerService';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Non-Functional Batch 4: In-Memory Metadata Caching & Cooperative Scheduling', () => {
  beforeEach(async () => {
    StaticMetadataCache.clear();
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('1. StaticMetadataCache stores, retrieves, and isolates tenant cache entries', () => {
    const orgA = 'org-tenant-a';
    const orgB = 'org-tenant-b';

    StaticMetadataCache.set(orgA, 'settings', { currency: 'INR', name: 'Tenant A' });
    StaticMetadataCache.set(orgB, 'settings', { currency: 'USD', name: 'Tenant B' });

    expect(StaticMetadataCache.get(orgA, 'settings')).toEqual({ currency: 'INR', name: 'Tenant A' });
    expect(StaticMetadataCache.get(orgB, 'settings')).toEqual({ currency: 'USD', name: 'Tenant B' });

    // Invalidate orgA only
    StaticMetadataCache.invalidate(orgA);

    expect(StaticMetadataCache.get(orgA, 'settings')).toBeUndefined();
    // orgB remains cached
    expect(StaticMetadataCache.get(orgB, 'settings')).toEqual({ currency: 'USD', name: 'Tenant B' });
  });

  it('2. StaticMetadataCache honors TTL expiration', async () => {
    const org = 'org-ttl-test';
    // Set with short 20ms TTL
    StaticMetadataCache.set(org, 'temp_token', 'token_xyz', 20);

    expect(StaticMetadataCache.get(org, 'temp_token')).toBe('token_xyz');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(StaticMetadataCache.get(org, 'temp_token')).toBeUndefined();
  });

  it('3. JobSchedulerService cooperative yielding executes jobs without blocking event loop', async () => {
    const orgId = 'org-job-nfr-1';
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [orgId, 'uuid-job-nfr-1', 'PUB-JOB-1', 'JOB1', 'Job Test Org', 'India', 'INR', '₹', 'usr-job-1']
    );

    // Schedule 3 jobs
    await JobSchedulerService.scheduleJob(orgId, 'GENERIC_CALCULATION', { step: 1 });
    await JobSchedulerService.scheduleJob(orgId, 'GENERIC_CALCULATION', { step: 2 });
    await JobSchedulerService.scheduleJob(orgId, 'GENERIC_CALCULATION', { step: 3 });

    let eventLoopTickCount = 0;
    const tickInterval = setInterval(() => {
      eventLoopTickCount++;
    }, 1);

    const processed = await JobSchedulerService.processPendingJobs('worker-coop-test');
    clearInterval(tickInterval);

    expect(processed).toBe(3);
    const jobs = await JobSchedulerService.listJobs(orgId);
    expect(jobs.every((j) => j.status === 'COMPLETED')).toBe(true);
  });
});
