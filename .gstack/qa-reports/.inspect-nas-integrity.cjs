const fs = require('node:fs');
const { Client } = require('pg');

const compose = fs.readFileSync('Y:\\Compose\\firmbooks\\docker-compose.yaml', 'utf8');
function env(name, fallback) {
  const match = compose.match(new RegExp(`^\\s*${name}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'));
  return match?.[1] || fallback;
}

const client = new Client({
  host: '100.111.233.28',
  port: 5432,
  user: env('POSTGRES_USER', 'firmbooks'),
  password: env('POSTGRES_PASSWORD'),
  database: env('POSTGRES_DB', 'firmbooks'),
  ssl: false,
});

async function main() {
  await client.connect();
  const checks = await client.query(`
    SELECT 'invoice_customer' AS check_name, COUNT(*)::int AS count
      FROM invoices i
      LEFT JOIN customers c ON c.organization_id = i.organization_id AND c.id = i.customer_id
     WHERE i.customer_id IS NOT NULL AND c.id IS NULL
    UNION ALL
    SELECT 'bill_vendor', COUNT(*)::int
      FROM bills b
      LEFT JOIN vendors v ON v.organization_id = b.organization_id AND v.id = b.vendor_id
     WHERE b.vendor_id IS NOT NULL AND v.id IS NULL
    UNION ALL
    SELECT 'journal_account', COUNT(*)::int
      FROM journal_lines jl
      LEFT JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id
     WHERE jl.organization_id IS NOT NULL AND a.id IS NULL
    UNION ALL
    SELECT 'payment_received_allocation', COUNT(*)::int
      FROM payment_received_allocations pra
      LEFT JOIN payments_received p ON p.organization_id = pra.organization_id AND p.id = pra.payment_id
      LEFT JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
     WHERE p.id IS NULL OR i.id IS NULL
    UNION ALL
    SELECT 'payment_made_allocation', COUNT(*)::int
      FROM payment_made_allocations pma
      LEFT JOIN payments_made p ON p.organization_id = pma.organization_id AND p.id = pma.payment_id
      LEFT JOIN bills b ON b.organization_id = pma.organization_id AND b.id = pma.bill_id
     WHERE p.id IS NULL OR b.id IS NULL
    UNION ALL
    SELECT 'credit_note_application', COUNT(*)::int
      FROM credit_note_applications cna
      LEFT JOIN credit_notes c ON c.organization_id = cna.organization_id AND c.id = cna.credit_note_id
      LEFT JOIN invoices i ON i.organization_id = cna.organization_id AND i.id = cna.invoice_id
     WHERE c.id IS NULL OR i.id IS NULL
    UNION ALL
    SELECT 'debit_note_application', COUNT(*)::int
      FROM debit_note_applications dna
      LEFT JOIN vendor_credits vc ON vc.organization_id = dna.organization_id AND vc.id = dna.debit_note_id
      LEFT JOIN bills b ON b.organization_id = dna.organization_id AND b.id = dna.bill_id
     WHERE vc.id IS NULL OR b.id IS NULL
    ORDER BY check_name
  `);

  const invoices = await client.query(`
    SELECT i.id, i.organization_id, i.customer_id, i.invoice_number, i.status,
           COALESCE(array_agg(c_any.organization_id) FILTER (WHERE c_any.id IS NOT NULL), '{}') AS customer_organizations
      FROM invoices i
      LEFT JOIN customers c ON c.organization_id = i.organization_id AND c.id = i.customer_id
      LEFT JOIN customers c_any ON c_any.id = i.customer_id
     WHERE i.customer_id IS NOT NULL AND c.id IS NULL
     GROUP BY i.id, i.organization_id, i.customer_id, i.invoice_number, i.status
     ORDER BY i.organization_id, i.id
  `);

  console.log(JSON.stringify({ checks: checks.rows, invoices: invoices.rows }, null, 2));
}

main().finally(() => client.end()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
