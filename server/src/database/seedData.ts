import bcrypt from 'bcryptjs';
import { db } from './db';
import { initialAccounts, initialClients, initialVendors, initialProjects, initialInvoices, initialExpenses, initialJournalEntries } from '../../../src/services/seedData';

export class SeedDataRunner {
  public static async seedDefaults(): Promise<void> {
    console.log('[Seed] Checking database seed status...');

    // 1. Seed Roles & Permissions
    const permRes = await db.query('SELECT COUNT(*) FROM permissions');
    if (parseInt(permRes.rows[0]?.count || '0') === 0) {
      const permissionsList = [
        'invoice.create', 'invoice.edit', 'invoice.delete', 'invoice.view',
        'bill.create', 'bill.edit', 'bill.delete', 'bill.view',
        'expense.create', 'expense.edit', 'expense.approve', 'expense.view',
        'bank.reconcile', 'accounting.post', 'reports.view',
        'settings.manage', 'members.manage', 'audit.view'
      ];

      for (const p of permissionsList) {
        await db.query('INSERT INTO permissions (id, code, description) VALUES ($1, $2, $3)', [
          `perm-${p}`, p, `Allows ${p} action`
        ]);
      }
    }

    // 2. Seed Admin User
    const userRes = await db.query('SELECT COUNT(*) FROM users');
    let adminUserId = 'usr-identity-101';
    if (parseInt(userRes.rows[0]?.count || '0') === 0) {
      const salt = await bcrypt.genSalt(10);
      const passHash = await bcrypt.hash('AdminPassword123!', salt);
      await db.query(
        'INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, $3, $4, $5)',
        [adminUserId, 's.jenkins@apexgrowth.com', passHash, 'Sarah Jenkins', 'Active']
      );
    }

    // 3. Seed Default Organization
    const orgRes = await db.query('SELECT COUNT(*) FROM organizations');
    let defaultOrgId = 'ORG-2026-PRIMARY';
    if (parseInt(orgRes.rows[0]?.count || '0') === 0) {
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          defaultOrgId,
          'org-uuid-0001',
          'PUB-ORG-1001',
          'SENSE-01',
          'Sense studios design',
          'Construction',
          'India',
          'INR',
          '₹',
          adminUserId
        ]
      );

      // Add Admin user to Organization
      await db.query(
        'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        ['mem-101', defaultOrgId, adminUserId, 'Super Admin']
      );

      // Seed Accounts for Default Org
      for (const acc of initialAccounts) {
        await db.query(
          `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            acc.id,
            defaultOrgId,
            acc.code,
            acc.name,
            acc.type,
            acc.subType,
            acc.balance,
            acc.isSystemAccount || false,
            'Active'
          ]
        );
      }

      // Seed Clients
      for (const cli of initialClients) {
        await db.query(
          `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            cli.id,
            defaultOrgId,
            cli.name,
            cli.companyName || cli.name,
            cli.email,
            cli.phone || '',
            cli.billingAddress || '',
            cli.taxId || '',
            cli.currency || 'USD',
            cli.paymentTerms || 'Net 30'
          ]
        );
      }

      // Seed Vendors
      for (const ven of initialVendors) {
        await db.query(
          `INSERT INTO vendors (id, organization_id, name, company_name, email, phone, payables_balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            ven.id,
            defaultOrgId,
            ven.name,
            ven.companyName || ven.name,
            ven.email || '',
            ven.phone || '',
            0.00
          ]
        );
      }

      // Seed Projects
      for (const prj of initialProjects) {
        await db.query(
          `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, description, status, budget_type, total_budget, hourly_rate, manager)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            prj.id,
            defaultOrgId,
            prj.code,
            prj.name,
            prj.clientId,
            prj.clientName,
            prj.description || '',
            prj.status,
            prj.budgetType,
            prj.totalBudget,
            prj.hourlyRate,
            prj.manager
          ]
        );
      }

      // Seed Invoices
      for (const inv of initialInvoices) {
        await db.query(
          `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, client_email, project_id, issue_date, due_date, subtotal, tax_total, discount, total_amount, paid_amount, balance_due, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            inv.id,
            defaultOrgId,
            inv.invoiceNumber,
            inv.clientId,
            inv.clientName,
            inv.clientEmail || '',
            inv.projectId || null,
            inv.issueDate,
            inv.dueDate,
            inv.subtotal,
            inv.taxTotal,
            inv.discount,
            inv.totalAmount,
            inv.paidAmount,
            inv.balanceDue,
            inv.status,
            inv.notes || ''
          ]
        );
      }

      // Seed Expenses
      for (const exp of initialExpenses) {
        await db.query(
          `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_name, date, amount, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            exp.id,
            defaultOrgId,
            exp.referenceNumber || `EXP-${exp.id}`,
            exp.accountId,
            exp.paidFromAccountId,
            exp.vendorName || '',
            exp.date,
            exp.amount,
            exp.description || ''
          ]
        );
      }

      // Seed Journal Entries
      for (const jrn of initialJournalEntries) {
        await db.query(
          `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            jrn.id,
            defaultOrgId,
            jrn.entryNumber,
            jrn.date,
            jrn.reference || '',
            jrn.description || '',
            jrn.status
          ]
        );

        for (const line of jrn.lines) {
          await db.query(
            `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              line.id,
              jrn.id,
              line.accountId,
              line.accountCode || '',
              line.accountName || '',
              line.debit,
              line.credit,
              line.description || ''
            ]
          );
        }
      }
    }

    console.log('[Seed] Database seed completed successfully.');
  }
}
