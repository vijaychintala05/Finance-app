const fs = require('node:fs');

const dir = 'Y:\\Compose\\firmbooks-live';
const composePath = `${dir}\\docker-compose.yaml`;
const probePath = `${dir}\\integrity-probe.cjs`;
const marker = '  integrity_probe:';

const probe = `const { Client } = require('/app/node_modules/pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await client.connect();
  const result = await client.query(\`SELECT i.id, i.organization_id, i.customer_id, i.invoice_number, i.status, i.client_name, i.client_email, i.total_amount, i.paid_amount, i.balance_due, o.base_currency, (SELECT COUNT(*)::int FROM payment_received_allocations pra WHERE pra.organization_id=i.organization_id AND pra.invoice_id=i.id) AS allocation_count, COALESCE((SELECT string_agg(c2.organization_id::text, ',') FROM customers c2 WHERE c2.id=i.customer_id), '<missing>') AS customer_found_in_orgs FROM invoices i JOIN organizations o ON o.id=i.organization_id LEFT JOIN customers c ON c.organization_id=i.organization_id AND c.id=i.customer_id WHERE i.customer_id IS NOT NULL AND c.id IS NULL ORDER BY i.organization_id, i.id\`);
  console.log('INTEGRITY_PROBE_RESULT=' + JSON.stringify(result.rows));
})().finally(() => client.end()).catch(error => { console.error('INTEGRITY_PROBE_ERROR=' + error.message); process.exitCode = 1; });
`;

let compose = fs.readFileSync(composePath, 'utf8').replace(/\r\n/g, '\n');
if (!compose.includes(marker)) {
  const databaseUrl = compose.match(/^\s*DATABASE_URL:\s*(.+)$/m)?.[1];
  if (!databaseUrl) throw new Error('DATABASE_URL not found');
  const service = `  integrity_probe:\n    image: ghcr.io/vijaychintala05/finance-app:latest\n    restart: \"no\"\n    environment:\n      DATABASE_URL: ${databaseUrl}\n    command: [\"node\", \"/probe/integrity-probe.cjs\"]\n    volumes:\n      - \"/ufi/pool-raw/syspool/Compose/firmbooks-live/integrity-probe.cjs:/probe/integrity-probe.cjs:ro\"\n    networks:\n      source_database: null\n    read_only: true\n\n`;
  compose = compose.replace(/^networks:/m, service + 'networks:');
}
fs.writeFileSync(probePath, probe, 'utf8');
fs.writeFileSync(composePath, compose.replace(/\n/g, '\r\n'), 'utf8');
console.log('NAS_INTEGRITY_PROBE_INSTALLED');
