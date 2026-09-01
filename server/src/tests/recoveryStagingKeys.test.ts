import { describe, expect, it } from 'vitest';
import { recoveryStagingRowKey } from '../recovery/ProductionRecoveryAdapters';
import { POINT1_RECOVERY_SCHEMA } from '../recovery/schema';

describe('recovery staging keys', () => {
  it('keeps composite accounting-default rows distinct during recovery staging', () => {
    const schema = POINT1_RECOVERY_SCHEMA.find((table) => table.name === 'accounting_defaults');
    expect(schema).toBeDefined();
    const first = recoveryStagingRowKey(schema!, { organization_id: 'org-1', system_role: 'AR_CONTROL' });
    const second = recoveryStagingRowKey(schema!, { organization_id: 'org-1', system_role: 'AP_CONTROL' });
    expect(first).not.toBe(second);
  });
});
