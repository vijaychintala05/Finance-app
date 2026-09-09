const fs = require('node:fs');

const probePath = 'Y:\\Compose\\firmbooks-live\\integrity-probe.cjs';
const script = `const { Client } = require('/app/node_modules/pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
const expected = ['inv-40ed85d0-5f4a-47b9-b5b1-70d9baea1502', 'inv-8e0c93b9-7f63-4bd3-8e2d-81125ad4acd3'];
(async () => {
  await client.connect();
  await client.query('BEGIN');
  try {
    const bad = await client.query(\`SELECT i.id, i.organization_id, i.customer_id, i.client_name, i.client_email, i.status, o.base_currency FROM invoices i JOIN organizations o ON o.id=i.organization_id LEFT JOIN customers c ON c.organization_id=i.organization_id AND c.id=i.customer_id WHERE i.customer_id IS NOT NULL AND c.id IS NULL ORDER BY i.id FOR UPDATE OF i\`);
    const actual = bad.rows.map(row => row.id).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Repair guard failed: unexpected corrupt invoice set');
    for (const row of bad.rows) {
      await client.query(\`INSERT INTO customers (id, organization_id, display_name, email, currency, active, notes) VALUES ($1,$2,$3,$4,$5,FALSE,$6)\`, [row.customer_id, row.organization_id, row.client_name, row.client_email, row.base_currency, 'Inactive historical customer reconstructed from immutable invoice snapshot during tenant-FK qualification']);
      await client.query(\`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state, metadata) VALUES ($1,$2,'system-migration-repair','RECONSTRUCT_MISSING_CUSTOMER','CUSTOMER',$3,NULL,$4::jsonb,$5::jsonb)\`, ['audit-repair-' + row.customer_id.slice(4), row.organization_id, row.customer_id, JSON.stringify({ displayName: row.client_name, email: row.client_email, currency: row.base_currency, active: false }), JSON.stringify({ reason: 'tenant-safe foreign key qualification', sourceInvoiceId: row.id, sourceInvoiceStatus: row.status })]);
    }
    const validation = await client.query(\`SELECT COUNT(*)::int AS count FROM invoices i LEFT JOIN customers c ON c.organization_id=i.organization_id AND c.id=i.customer_id WHERE i.customer_id IS NOT NULL AND c.id IS NULL\`);
    if (validation.rows[0].count !== 0) throw new Error('Post-repair validation failed');
    await client.query('COMMIT');
    console.log('INTEGRITY_REPAIR_RESULT=' + JSON.stringify({ reconstructedCustomers: bad.rowCount, remainingInvalidInvoiceCustomers: 0 }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
})().finally(() => client.end()).catch(error => { console.error('INTEGRITY_REPAIR_ERROR=' + error.message); process.exitCode = 1; });
`;
fs.writeFileSync(probePath, script, 'utf8');
console.log('NAS_INTEGRITY_REPAIR_STAGED');
