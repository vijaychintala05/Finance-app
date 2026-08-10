import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SalesEngine } from '../sales/SalesEngine';

async function main() {
  console.log('====================================================');
  console.log(' ACCOUNTS RECEIVABLE SUBLEDGER INTEGRITY VERIFIER   ');
  console.log('====================================================');

  try {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    const ORG_ID = 'org-demo-123';

    // Seed default accounts if needed
    await db.query(`
      INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
      VALUES ('acc-ar-control', '${ORG_ID}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00)
      ON CONFLICT DO NOTHING
    `);

    const report = await SalesEngine.verifyARIntegrity(ORG_ID);

    console.log(`\nOrganization ID: ${ORG_ID}`);
    console.log(`Customer Subledger Balance : ₹${report.customerSubledgerTotal.toFixed(2)}`);
    console.log(`AR GL Control Account Balance: ₹${report.arControlGLBalance.toFixed(2)}`);
    console.log(`Variance / Difference       : ₹${report.difference.toFixed(2)}`);
    console.log(`Integrity Verification Status: ${report.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);

    console.log('\nBreakdown Details:');
    console.log(` - Open Invoices Outstanding: ₹${report.details.openInvoicesBal.toFixed(2)}`);
    console.log(` - Open Customer Credits    : ₹${report.details.openCredits.toFixed(2)}`);
    console.log(` - Open Customer Advances   : ₹${report.details.openAdvances.toFixed(2)}`);

    if (!report.isValid) {
      console.error('\nCRITICAL: Accounts Receivable Subledger does NOT match GL Control Account!');
      process.exit(1);
    } else {
      console.log('\nSUCCESS: Perfect zero-discrepancy AR Subledger reconciliation.');
      process.exit(0);
    }
  } catch (err) {
    console.error('\nError running AR integrity verification:', err);
    process.exit(1);
  }
}

main();
