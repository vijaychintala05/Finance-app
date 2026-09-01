import { db } from './db';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { applyPoint1Schema } from './point1Schema';
import { applyIdentitySchema } from './identitySchema';
import { applyEnterpriseHardeningSchema } from './enterpriseHardeningSchema';
import type { DbQueryResult } from './db';

export const CURRENT_SCHEMA_VERSION = '2026.08.31-v7-expense-receipts';

export class MigrationRunner {
  public static async runMigrations(queryClient?: { query: (text: string, params?: any[]) => Promise<DbQueryResult> }): Promise<void> {
    if (!queryClient) {
      if (db.isMemoryMode()) {
        await this.runMigrations(db);
        return;
      }
      await db.transaction((client) => this.runMigrations(client));
      return;
    }
    console.log('[Migration] Starting PostgreSQL schema migrations...');

    const migTableCheck = await queryClient.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`);
    if (migTableCheck.rows.length === 0) {
      await queryClient.query(
        `CREATE TABLE schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          description VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
    }

    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS organizations (
        id VARCHAR(64) PRIMARY KEY,
        uuid VARCHAR(64) UNIQUE NOT NULL,
        public_org_id VARCHAR(32) UNIQUE NOT NULL,
        org_code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        industry VARCHAR(100),
        country VARCHAR(100) NOT NULL,
        base_currency VARCHAR(3) NOT NULL,
        currency_symbol VARCHAR(10) NOT NULL,
        owner_user_id VARCHAR(64) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS organization_profiles (
        organization_id VARCHAR(64) PRIMARY KEY,
        legal_name VARCHAR(255),
        trade_name VARCHAR(255),
        tax_id VARCHAR(50),
        gstin VARCHAR(50),
        pan VARCHAR(50),
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        postal_code VARCHAR(30),
        country VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        fiscal_year_start VARCHAR(20) DEFAULT 'April',
        default_payment_terms VARCHAR(50) DEFAULT 'Net 30',
        invoice_prefix VARCHAR(20) DEFAULT 'INV-',
        estimate_prefix VARCHAR(20) DEFAULT 'EST-',
        po_prefix VARCHAR(20) DEFAULT 'PO-',
        bill_prefix VARCHAR(20) DEFAULT 'BILL-',
        logo_url TEXT,
        invoice_notes TEXT,
        bank_name VARCHAR(120),
        bank_account_number VARCHAR(60),
        bank_ifsc_swift VARCHAR(40),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS organization_members (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        role VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_user UNIQUE (organization_id, user_id)
      )`,

      `CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system_role BOOLEAN DEFAULT FALSE
      )`,

      `CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        description TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS role_permissions (
        role_id VARCHAR(64) NOT NULL,
        permission_code VARCHAR(100) NOT NULL,
        PRIMARY KEY (role_id, permission_code)
      )`,

      `CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        sub_type VARCHAR(50) NOT NULL,
        balance NUMERIC(15, 2) DEFAULT 0.00,
        is_system_account BOOLEAN DEFAULT FALSE,
        is_locked BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'Active',
        parent_account_id VARCHAR(64),
        reporting_group VARCHAR(100),
        normal_balance VARCHAR(6) NOT NULL DEFAULT 'Debit',
        normal_balance_is_explicit BOOLEAN NOT NULL DEFAULT FALSE,
        allow_direct_posting BOOLEAN NOT NULL DEFAULT TRUE,
        system_role VARCHAR(64),
        financial_statement VARCHAR(32),
        cash_flow_classification VARCHAR(32),
        currency_code VARCHAR(3),
        archived_at TIMESTAMP WITH TIME ZONE,
        archived_by VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_account_code UNIQUE (organization_id, code)
      )`,

      `CREATE TABLE IF NOT EXISTS accounting_defaults (
        organization_id VARCHAR(64) NOT NULL,
        system_role VARCHAR(64) NOT NULL,
        account_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (organization_id, system_role)
      )`,

      `CREATE TABLE IF NOT EXISTS bank_accounts (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        ledger_account_id VARCHAR(64),
        account_name VARCHAR(255) NOT NULL,
        account_number VARCHAR(100) NOT NULL,
        masked_account_number VARCHAR(100),
        bank_name VARCHAR(255) NOT NULL,
        account_type VARCHAR(50) DEFAULT 'Checking',
        currency VARCHAR(3) NOT NULL,
        country VARCHAR(100),
        current_balance NUMERIC(15, 2) DEFAULT 0.00,
        opening_balance_date DATE,
        statement_import_enabled BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'Active',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS bank_statement_imports (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        bank_account_id VARCHAR(64) NOT NULL,
        source_format VARCHAR(50) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_hash VARCHAR(128) NOT NULL,
        parser_version VARCHAR(20) DEFAULT '1.0',
        statement_from DATE,
        statement_to DATE,
        opening_balance NUMERIC(15, 2) DEFAULT 0.00,
        closing_balance NUMERIC(15, 2) DEFAULT 0.00,
        currency VARCHAR(3) NOT NULL,
        imported_by VARCHAR(64),
        imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        transaction_count INT DEFAULT 0,
        status VARCHAR(30) DEFAULT 'Completed'
      )`,

      `CREATE TABLE IF NOT EXISTS bank_statement_transactions (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        bank_account_id VARCHAR(64) NOT NULL,
        statement_import_id VARCHAR(64) NOT NULL,
        transaction_date DATE NOT NULL,
        value_date DATE,
        amount NUMERIC(15, 2) NOT NULL,
        direction VARCHAR(20) NOT NULL,
        running_balance NUMERIC(15, 2),
        narration TEXT NOT NULL,
        reference VARCHAR(255),
        transaction_type VARCHAR(50),
        utr VARCHAR(100),
        rrn VARCHAR(100),
        upi_reference VARCHAR(100),
        cheque_number VARCHAR(50),
        counterparty_name VARCHAR(255),
        currency VARCHAR(3) NOT NULL,
        reconciliation_status VARCHAR(30) DEFAULT 'UNMATCHED',
        fingerprint VARCHAR(128) NOT NULL,
        raw_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        statement_transaction_id VARCHAR(64) NOT NULL,
        accounting_transaction_type VARCHAR(50) NOT NULL,
        accounting_transaction_id VARCHAR(64) NOT NULL,
        matched_amount NUMERIC(15, 2) NOT NULL,
        match_confidence NUMERIC(5, 2) DEFAULT 0.00,
        match_reasons JSONB,
        matched_by VARCHAR(64),
        matched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(30) DEFAULT 'MATCHED'
      )`,

      `CREATE TABLE IF NOT EXISTS bank_reconciliation_rules (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        rule_name VARCHAR(255) NOT NULL,
        priority INT DEFAULT 1,
        narration_pattern VARCHAR(255) NOT NULL,
        direction VARCHAR(20) DEFAULT 'BOTH',
        suggested_category VARCHAR(100),
        suggested_account_id VARCHAR(64),
        is_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS bank_reconciliation_sessions (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        bank_account_id VARCHAR(64) NOT NULL,
        statement_end_date DATE NOT NULL,
        statement_closing_balance NUMERIC(15, 2) NOT NULL,
        ledger_balance NUMERIC(15, 2) NOT NULL,
        difference NUMERIC(15, 2) DEFAULT 0.00,
        reconciled_by VARCHAR(64),
        reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(30) DEFAULT 'IN_PROGRESS'
      )`,

      `CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        billing_address TEXT,
        tax_id VARCHAR(50),
        currency VARCHAR(3) NOT NULL,
        payment_terms VARCHAR(50) DEFAULT 'Net 30',
        notes TEXT,
        receivables_balance NUMERIC(15, 2) DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS vendors (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        billing_address TEXT,
        payables_balance NUMERIC(15, 2) DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS salespersons (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        commission_rate NUMERIC(5, 2) DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        client_id VARCHAR(64),
        client_name VARCHAR(255),
        description TEXT,
        status VARCHAR(30) DEFAULT 'Active',
        budget_type VARCHAR(50) DEFAULT 'Fixed Cost',
        total_budget NUMERIC(15, 2) DEFAULT 0.00,
        hourly_rate NUMERIC(15, 2) DEFAULT 0.00,
        manager VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS time_entries (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        project_id VARCHAR(64) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        staff_name VARCHAR(255) NOT NULL,
        task_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        hours NUMERIC(8, 2) NOT NULL,
        hourly_rate NUMERIC(15, 2) NOT NULL,
        is_billable BOOLEAN DEFAULT TRUE,
        is_billed BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS estimates (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        estimate_number VARCHAR(64) NOT NULL,
        client_id VARCHAR(64),
        client_name VARCHAR(255) NOT NULL,
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        tax_total NUMERIC(15, 2) DEFAULT 0.00,
        discount NUMERIC(15, 2) DEFAULT 0.00,
        round_off_amount NUMERIC(15, 2) DEFAULT 0.00,
        is_gst_inclusive BOOLEAN DEFAULT FALSE,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'Draft',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_estimate_num UNIQUE (organization_id, estimate_number)
      )`,

      `CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        invoice_number VARCHAR(64) NOT NULL,
        sales_order_id VARCHAR(64),
        estimate_id VARCHAR(64),
        client_id VARCHAR(64),
        customer_id VARCHAR(64),
        client_name VARCHAR(255) NOT NULL,
        client_email VARCHAR(255),
        project_id VARCHAR(64),
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        tax_total NUMERIC(15, 2) DEFAULT 0.00,
        discount NUMERIC(15, 2) DEFAULT 0.00,
        round_off_amount NUMERIC(15, 2) DEFAULT 0.00,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        paid_amount NUMERIC(15, 2) DEFAULT 0.00,
        amount_credited NUMERIC(15, 2) DEFAULT 0.00,
        amount_written_off NUMERIC(15, 2) DEFAULT 0.00,
        balance_due NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'Draft',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_invoice_number UNIQUE (organization_id, invoice_number)
      )`,

      `CREATE TABLE IF NOT EXISTS invoice_items (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        invoice_id VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        account_id VARCHAR(64),
        quantity NUMERIC(12, 2) NOT NULL,
        unit_price NUMERIC(15, 2) NOT NULL,
        tax_rate NUMERIC(5, 2) DEFAULT 0.00,
        amount NUMERIC(15, 2) NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS payments_received (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        payment_number VARCHAR(64) NOT NULL,
        client_id VARCHAR(64) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        payment_date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        payment_mode VARCHAR(50) NOT NULL,
        deposit_to_account_id VARCHAR(64) NOT NULL,
        reference VARCHAR(255),
        notes TEXT,
        unallocated_amount NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'ALLOCATED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_payment_num UNIQUE (organization_id, payment_number)
      )`,

      `CREATE TABLE IF NOT EXISTS payment_received_allocations (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        payment_id VARCHAR(64) NOT NULL,
        invoice_id VARCHAR(64) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS bills (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        bill_number VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64),
        vendor_name VARCHAR(255) NOT NULL,
        bill_date DATE NOT NULL,
        due_date DATE NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL,
        amount_paid NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'Unpaid',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS payments_made (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        payment_number VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64) NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        payment_date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        payment_mode VARCHAR(50) NOT NULL,
        paid_from_account_id VARCHAR(64) NOT NULL,
        reference VARCHAR(255),
        notes TEXT,
        unallocated_amount NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'ALLOCATED',
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS credit_notes (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        credit_note_number VARCHAR(64) NOT NULL,
        client_id VARCHAR(64) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL,
        remaining_credit NUMERIC(15, 2) NOT NULL,
        status VARCHAR(30) DEFAULT 'Open',
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS vendor_credits (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        credit_number VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64) NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL,
        remaining_credit NUMERIC(15, 2) NOT NULL,
        status VARCHAR(30) DEFAULT 'Open',
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        expense_number VARCHAR(64) NOT NULL,
        expense_account_id VARCHAR(64) NOT NULL,
        paid_from_account_id VARCHAR(64) NOT NULL,
        vendor_name VARCHAR(255),
        date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        tax_rate NUMERIC(5, 2) DEFAULT 0.00,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        entry_number VARCHAR(64) NOT NULL,
        date DATE NOT NULL,
        reference VARCHAR(255),
        description TEXT,
        status VARCHAR(20) DEFAULT 'Posted',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS journal_lines (
        id VARCHAR(64) PRIMARY KEY,
        journal_entry_id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64),
        account_id VARCHAR(64) NOT NULL,
        account_code VARCHAR(32),
        account_name VARCHAR(255),
        debit NUMERIC(15, 2) DEFAULT 0.00,
        credit NUMERIC(15, 2) DEFAULT 0.00,
        description TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS period_locks (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        year INT,
        month INT,
        period_name VARCHAR(50),
        is_locked BOOLEAN DEFAULT FALSE,
        lock_date DATE,
        region VARCHAR(100) DEFAULT 'Global',
        locked_by VARCHAR(255),
        locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'Active'
      )`,

      `CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        before_state JSONB,
        after_state JSONB,
        metadata JSONB
      )`,

      `CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64),
        display_name VARCHAR(255) NOT NULL,
        legal_name VARCHAR(255),
        customer_type VARCHAR(50) DEFAULT 'Business',
        gst_status VARCHAR(50) DEFAULT 'Unregistered',
        gstin VARCHAR(50),
        pan VARCHAR(50),
        billing_address JSONB,
        shipping_addresses JSONB,
        place_of_supply VARCHAR(100),
        primary_contact JSONB,
        additional_contacts JSONB,
        email VARCHAR(255),
        phone VARCHAR(50),
        currency VARCHAR(3) NOT NULL,
        payment_terms VARCHAR(50) DEFAULT 'Net 30',
        credit_limit NUMERIC(15, 2) DEFAULT 0.00,
        price_list_id VARCHAR(64),
        tax_preferences JSONB,
        default_sales_account_id VARCHAR(64),
        salesperson_id VARCHAR(64),
        notes TEXT,
        attachments JSONB,
        active BOOLEAN DEFAULT TRUE,
        opening_balance NUMERIC(15, 2) DEFAULT 0.00,
        receivables_balance NUMERIC(15, 2) DEFAULT 0.00,
        unused_credits NUMERIC(15, 2) DEFAULT 0.00,
        advance_balance NUMERIC(15, 2) DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS estimate_revisions (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        estimate_id VARCHAR(64) NOT NULL,
        revision_number INT NOT NULL,
        change_summary TEXT,
        snapshot JSONB,
        created_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS sales_orders (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        sales_order_number VARCHAR(64) NOT NULL,
        estimate_id VARCHAR(64),
        customer_id VARCHAR(64),
        customer_name VARCHAR(255) NOT NULL,
        customer_snapshot JSONB,
        order_date DATE NOT NULL,
        expected_delivery DATE,
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        tax_total NUMERIC(15, 2) DEFAULT 0.00,
        discount NUMERIC(15, 2) DEFAULT 0.00,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        fulfilled_amount NUMERIC(15, 2) DEFAULT 0.00,
        invoiced_amount NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'DRAFT',
        line_items JSONB,
        project_id VARCHAR(64),
        notes TEXT,
        attachments JSONB,
        custom_fields JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_sales_order_num UNIQUE (organization_id, sales_order_number)
      )`,

      `CREATE TABLE IF NOT EXISTS delivery_challans (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        challan_number VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        sales_order_id VARCHAR(64),
        delivery_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'DRAFT',
        reason VARCHAR(255),
        line_items JSONB,
        transport_details JSONB,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_challan_num UNIQUE (organization_id, challan_number)
      )`,

      `CREATE TABLE IF NOT EXISTS recurring_invoice_profiles (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        profile_name VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        next_generation_date DATE NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        line_items JSONB,
        payment_terms VARCHAR(50),
        auto_send BOOLEAN DEFAULT FALSE,
        status VARCHAR(30) DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS customer_advances (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        payment_id VARCHAR(64),
        amount NUMERIC(15, 2) NOT NULL,
        unapplied_amount NUMERIC(15, 2) NOT NULL,
        received_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'UNAPPLIED',
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS customer_refunds (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        refund_number VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        credit_note_id VARCHAR(64),
        payment_id VARCHAR(64),
        refund_date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        refund_account_id VARCHAR(64) NOT NULL,
        reference VARCHAR(255),
        notes TEXT,
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS ar_write_offs (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        invoice_id VARCHAR(64) NOT NULL,
        customer_id VARCHAR(64) NOT NULL,
        write_off_date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        write_off_account_id VARCHAR(64) NOT NULL,
        reason TEXT,
        user_id VARCHAR(64),
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS credit_note_applications (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        credit_note_id VARCHAR(64) NOT NULL,
        invoice_id VARCHAR(64) NOT NULL,
        amount_applied NUMERIC(15, 2) NOT NULL,
        applied_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        purchase_order_number VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64),
        vendor_name VARCHAR(255) NOT NULL,
        vendor_snapshot JSONB,
        order_date DATE NOT NULL,
        expected_delivery DATE,
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        tax_total NUMERIC(15, 2) DEFAULT 0.00,
        discount NUMERIC(15, 2) DEFAULT 0.00,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        billed_amount NUMERIC(15, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'DRAFT',
        line_items JSONB,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_po_num UNIQUE (organization_id, purchase_order_number)
      )`,

      `CREATE TABLE IF NOT EXISTS goods_service_receipts (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        receipt_number VARCHAR(64) NOT NULL,
        purchase_order_id VARCHAR(64),
        vendor_id VARCHAR(64) NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        receipt_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'RECEIVED',
        line_items JSONB,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_receipt_num UNIQUE (organization_id, receipt_number)
      )`,

      `CREATE TABLE IF NOT EXISTS vendor_advances (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64) NOT NULL,
        payment_id VARCHAR(64),
        amount NUMERIC(15, 2) NOT NULL,
        unapplied_amount NUMERIC(15, 2) NOT NULL,
        paid_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'UNAPPLIED',
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS payment_made_allocations (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        payment_id VARCHAR(64) NOT NULL,
        bill_id VARCHAR(64) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS debit_note_applications (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        debit_note_id VARCHAR(64) NOT NULL,
        bill_id VARCHAR(64) NOT NULL,
        amount_applied NUMERIC(15, 2) NOT NULL,
        applied_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS ap_write_offs (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        bill_id VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64) NOT NULL,
        write_off_date DATE NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        write_off_account_id VARCHAR(64) NOT NULL,
        reason TEXT,
        user_id VARCHAR(64),
        journal_entry_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR(64)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS estimate_id VARCHAR(64)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_credited NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_written_off NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS year INT`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS month INT`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS period_name VARCHAR(50)`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64)`,
      `UPDATE journal_lines AS line
         SET organization_id = entry.organization_id
        FROM journal_entries AS entry
       WHERE line.journal_entry_id = entry.id
         AND line.organization_id IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_journal_lines_org_entry ON journal_lines (organization_id, journal_entry_id)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS revision_number INT DEFAULT 0`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ALLOCATED'`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE organizations ALTER COLUMN country DROP DEFAULT`,
      `ALTER TABLE organizations ALTER COLUMN base_currency DROP DEFAULT`,
      `ALTER TABLE organizations ALTER COLUMN currency_symbol DROP DEFAULT`,
      `ALTER TABLE bank_accounts ALTER COLUMN currency DROP DEFAULT`,
      `ALTER TABLE bank_accounts ALTER COLUMN country DROP DEFAULT`,
      `ALTER TABLE bank_statement_imports ALTER COLUMN currency DROP DEFAULT`,
      `ALTER TABLE bank_statement_transactions ALTER COLUMN currency DROP DEFAULT`,
      `ALTER TABLE clients ALTER COLUMN currency DROP DEFAULT`,
      `ALTER TABLE customers ALTER COLUMN currency DROP DEFAULT`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(64)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS vendor_type VARCHAR(50) DEFAULT 'Business'`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_status VARCHAR(50) DEFAULT 'Unregistered'`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gstin VARCHAR(50)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan VARCHAR(50)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS shipping_address JSONB`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS primary_contact JSONB`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'Net 30'`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS currency VARCHAR(3)`,
      `ALTER TABLE vendors ALTER COLUMN currency DROP DEFAULT`,
      `UPDATE bank_accounts SET currency = organizations.base_currency FROM organizations WHERE bank_accounts.organization_id = organizations.id AND (bank_accounts.currency IS NULL OR bank_accounts.currency = '')`,
      `UPDATE bank_statement_imports SET currency = bank_accounts.currency FROM bank_accounts WHERE bank_statement_imports.organization_id = bank_accounts.organization_id AND bank_statement_imports.bank_account_id = bank_accounts.id AND (bank_statement_imports.currency IS NULL OR bank_statement_imports.currency = '')`,
      `UPDATE bank_statement_transactions SET currency = bank_accounts.currency FROM bank_accounts WHERE bank_statement_transactions.organization_id = bank_accounts.organization_id AND bank_statement_transactions.bank_account_id = bank_accounts.id AND (bank_statement_transactions.currency IS NULL OR bank_statement_transactions.currency = '')`,
      `UPDATE clients SET currency = organizations.base_currency FROM organizations WHERE clients.organization_id = organizations.id AND (clients.currency IS NULL OR clients.currency = '')`,
      `UPDATE customers SET currency = organizations.base_currency FROM organizations WHERE customers.organization_id = organizations.id AND (customers.currency IS NULL OR customers.currency = '')`,
      `UPDATE vendors SET currency = organizations.base_currency FROM organizations WHERE vendors.organization_id = organizations.id AND (vendors.currency IS NULL OR vendors.currency = '')`,
      `ALTER TABLE organizations ALTER COLUMN country SET NOT NULL`,
      `ALTER TABLE organizations ALTER COLUMN base_currency SET NOT NULL`,
      `ALTER TABLE organizations ALTER COLUMN currency_symbol SET NOT NULL`,
      `ALTER TABLE bank_accounts ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE bank_statement_imports ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE bank_statement_transactions ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE clients ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE customers ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE vendors ALTER COLUMN currency SET NOT NULL`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS default_expense_account_id VARCHAR(64)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS unused_credits NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS advance_balance NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_id VARCHAR(64)`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_id VARCHAR(64)`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(64)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS vendor_invoice_number VARCHAR(64)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS purchase_order_id VARCHAR(64)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS tax_total NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS amount_debited NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS amount_written_off NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS balance_due NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS line_items JSONB`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
      `ALTER TABLE payments_made ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE payments_made ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ALLOCATED'`,
      `ALTER TABLE payments_made ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE payments_made ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
      `ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS debit_note_number VARCHAR(64)`,
      `ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS bill_id VARCHAR(64)`,
      `ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,

      `CREATE TABLE IF NOT EXISTS approval_rules (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        is_required BOOLEAN DEFAULT FALSE,
        threshold_amount NUMERIC(15, 2),
        approver_role VARCHAR(50) DEFAULT 'Admin',
        allow_self_approval BOOLEAN DEFAULT FALSE,
        CONSTRAINT uk_org_entity_approval UNIQUE (organization_id, entity_type)
      )`,
      `ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS allow_self_approval BOOLEAN DEFAULT FALSE`,

      `CREATE TABLE IF NOT EXISTS approval_requests (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        submitted_by VARCHAR(64) NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(30) DEFAULT 'SUBMITTED',
        approved_by VARCHAR(64),
        approved_at TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,
        amount NUMERIC(15, 2)
      )`,

      `CREATE TABLE IF NOT EXISTS backups (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        schema_version VARCHAR(20) DEFAULT '1.0.0',
        record_count INT DEFAULT 0,
        checksum VARCHAR(128) NOT NULL,
        data JSONB
      )`,

      `CREATE TABLE IF NOT EXISTS revoked_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        token_hash VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash VARCHAR(128) PRIMARY KEY,
        attempt_count INT NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS public_rate_limits (
        key_hash VARCHAR(128) PRIMARY KEY,
        request_count INT NOT NULL DEFAULT 0,
        window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS api_idempotency_keys (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL,
        request_hash VARCHAR(128) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        state VARCHAR(20) NOT NULL,
        response_status INT,
        response_body JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT uk_org_idempotency_key UNIQUE (organization_id, idempotency_key)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON api_idempotency_keys (expires_at)`,

      `CREATE TABLE IF NOT EXISTS period_close_checklists (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        period_key VARCHAR(20) NOT NULL,
        status VARCHAR(30) DEFAULT 'DRAFT',
        checklist_data JSONB,
        closed_by VARCHAR(64),
        closed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_period_checklist UNIQUE (organization_id, period_key)
      )`,

      `CREATE TABLE IF NOT EXISTS accounting_period_closes (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        period_key VARCHAR(20) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
        closed_by VARCHAR(64),
        closed_at TIMESTAMP WITH TIME ZONE,
        reopened_by VARCHAR(64),
        reopened_at TIMESTAMP WITH TIME ZONE,
        reopen_reason TEXT,
        checklist_summary JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_accounting_period_close UNIQUE (organization_id, period_key)
      )`,

      `CREATE TABLE IF NOT EXISTS recurring_journal_profiles (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        frequency VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        next_run_date DATE NOT NULL,
        journal_template JSONB NOT NULL,
        auto_post BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_recurring_journal_name UNIQUE (organization_id, name)
      )`,

      `CREATE TABLE IF NOT EXISTS budgets (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(160) NOT NULL,
        financial_year VARCHAR(20) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_budget_version UNIQUE (organization_id, name, financial_year, version)
      )`,

      `CREATE TABLE IF NOT EXISTS budget_lines (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        budget_id VARCHAR(64) NOT NULL,
        account_id VARCHAR(64) NOT NULL,
        project_id VARCHAR(64),
        business_line VARCHAR(100),
        location_id VARCHAR(64),
        cost_center_id VARCHAR(64),
        period_key VARCHAR(20) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS saved_reports (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(160) NOT NULL,
        report_type VARCHAR(80) NOT NULL,
        visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
        is_favorite BOOLEAN DEFAULT FALSE,
        config JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS fixed_assets (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        asset_code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        asset_category VARCHAR(100) NOT NULL,
        purchase_date DATE NOT NULL,
        in_service_date DATE NOT NULL,
        purchase_value NUMERIC(15, 2) NOT NULL,
        residual_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        useful_life_months INT NOT NULL,
        depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE',
        asset_account_id VARCHAR(64) NOT NULL,
        accumulated_depreciation_account_id VARCHAR(64) NOT NULL,
        depreciation_expense_account_id VARCHAR(64) NOT NULL,
        vendor_id VARCHAR(64),
        bill_id VARCHAR(64),
        project_id VARCHAR(64),
        location_id VARCHAR(64),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        disposal_date DATE,
        disposal_proceeds NUMERIC(15, 2),
        disposal_journal_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_fixed_asset_code UNIQUE (organization_id, asset_code)
      )`,

      `CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_entries (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        asset_id VARCHAR(64) NOT NULL,
        period_key VARCHAR(20) NOT NULL,
        depreciation_amount NUMERIC(15, 2) NOT NULL,
        journal_entry_id VARCHAR(64) NOT NULL,
        posted_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_asset_depreciation_period UNIQUE (organization_id, asset_id, period_key)
      )`,

      `CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        description TEXT,
        hsn_sac VARCHAR(50),
        unit VARCHAR(50) DEFAULT 'Pcs',
        sales_rate NUMERIC(15, 2) DEFAULT 0.00,
        purchase_rate NUMERIC(15, 2) DEFAULT 0.00,
        gst_rate NUMERIC(5, 2) DEFAULT 0.00,
        sales_account_id VARCHAR(64),
        purchase_account_id VARCHAR(64),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE UNIQUE INDEX IF NOT EXISTS uk_items_org_sku ON items (organization_id, LOWER(sku)) WHERE sku IS NOT NULL AND sku != ''`,

      `CREATE TABLE IF NOT EXISTS quotation_revisions (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        quotation_id VARCHAR(64) NOT NULL,
        revision_number INT NOT NULL,
        revision_data JSONB NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL,
        status VARCHAR(30) DEFAULT 'Draft',
        change_summary TEXT,
        created_by VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS quotation_templates (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        name VARCHAR(100) NOT NULL,
        template_type VARCHAR(50) DEFAULT 'Classic',
        primary_color VARCHAR(20) DEFAULT '#1e293b',
        font_family VARCHAR(50) DEFAULT 'Inter',
        show_logo BOOLEAN DEFAULT TRUE,
        logo_url TEXT,
        company_info JSONB,
        show_tax_breakdown BOOLEAN DEFAULT TRUE,
        show_signature BOOLEAN DEFAULT TRUE,
        terms_and_conditions TEXT,
        bank_details TEXT,
        footer_note TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS document_sequences (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        prefix VARCHAR(50) NOT NULL,
        suffix VARCHAR(50) DEFAULT '',
        financial_year VARCHAR(20) NOT NULL,
        next_number INT NOT NULL DEFAULT 1,
        padding_length INT DEFAULT 4,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_doc_seq UNIQUE (organization_id, document_type, financial_year)
      )`,

      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64)`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_of_journal_id VARCHAR(64)`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversed_by_journal_id VARCHAR(64)`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(64)`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_reason TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reversal_journal_id VARCHAR(64)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(64)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reversal_reason TEXT`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS reversal_journal_id VARCHAR(64)`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(64)`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS reversal_reason TEXT`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'POSTED'`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversal_journal_id VARCHAR(64)`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(64)`,
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversal_reason TEXT`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS reversal_journal_id VARCHAR(64)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS reversed_by VARCHAR(64)`,
      `ALTER TABLE bills ADD COLUMN IF NOT EXISTS reversal_reason TEXT`,
      `DO $$ BEGIN
        UPDATE vendors AS v
           SET payables_balance = COALESCE((
             SELECT SUM(b.balance_due) FROM bills b
              WHERE b.organization_id = v.organization_id AND b.vendor_id = v.id
                AND UPPER(b.status) NOT IN ('VOID', 'VOIDED', 'DRAFT')
           ), 0);
      END $$`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS revision_number INT DEFAULT 0`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS terms TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_token VARCHAR(128)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS items JSONB`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS line_items JSONB`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB`,
      `ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS item_id VARCHAR(64)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS overall_discount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS is_gst_inclusive BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS template_id VARCHAR(64)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS validity_days INT DEFAULT 30`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_response_notes TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_snapshot JSONB`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS project_id VARCHAR(64)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS template_snapshot JSONB`,
      `ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS template_snapshot JSONB`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_snapshot JSONB`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_gst_inclusive BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS is_gst_inclusive BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_templates_one_default_per_org ON quotation_templates (organization_id) WHERE is_default = TRUE`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_journal_number ON journal_entries (organization_id, entry_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_bill_number ON bills (organization_id, bill_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_expense_number ON expenses (organization_id, expense_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_payment_made_number ON payments_made (organization_id, payment_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_credit_note_number ON credit_notes (organization_id, credit_note_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_vendor_credit_number ON vendor_credits (organization_id, credit_number)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_estimate_public_token ON estimates (public_token) WHERE public_token IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_invoice_source_estimate ON invoices (organization_id, estimate_id) WHERE estimate_id IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_sales_order_source_estimate ON sales_orders (organization_id, estimate_id) WHERE estimate_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries (organization_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_invoices_org_due_status ON invoices (organization_id, due_date, status)`,
      `CREATE INDEX IF NOT EXISTS idx_bills_org_due_status ON bills (organization_id, due_date, status)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_org_timestamp ON audit_logs (organization_id, timestamp DESC)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_fingerprint_unique ON bank_statement_transactions (organization_id, fingerprint)`,
      `CREATE INDEX IF NOT EXISTS idx_budget_lines_org_budget ON budget_lines (organization_id, budget_id)`,
      `CREATE INDEX IF NOT EXISTS idx_fixed_assets_org_status ON fixed_assets (organization_id, status)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_projects_org_code ON projects (organization_id, LOWER(code))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uk_roles_org_name_ci ON roles (organization_id, LOWER(name)) WHERE organization_id IS NOT NULL`,
      `DO $$ BEGIN
        UPDATE journal_entries AS original
           SET status = 'Posted',
               reversed_by_journal_id = reversal.id,
               reversed_at = COALESCE(reversal.created_at, CURRENT_TIMESTAMP),
               reversal_reason = COALESCE(original.reversal_reason, reversal.description)
          FROM journal_entries AS reversal
         WHERE UPPER(original.status) = 'REVERSED'
           AND original.entry_number LIKE 'JV/%'
           AND reversal.organization_id = original.organization_id
           AND reversal.entry_number = 'RV-' || original.entry_number;

        UPDATE journal_entries AS reversal
           SET reversal_of_journal_id = original.id
          FROM journal_entries AS original
         WHERE reversal.reversal_of_journal_id IS NULL
           AND original.reversed_by_journal_id = reversal.id;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_journal_reversal_original') THEN
          ALTER TABLE journal_entries ADD CONSTRAINT fk_journal_reversal_original
          FOREIGN KEY (reversal_of_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_journal_reversed_by') THEN
          ALTER TABLE journal_entries ADD CONSTRAINT fk_journal_reversed_by
          FOREIGN KEY (reversed_by_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM organizations
           WHERE base_currency NOT IN ('AED', 'AUD', 'CAD', 'EUR', 'GBP', 'INR', 'SGD', 'USD')
        ) THEN
          RAISE EXCEPTION 'Unsupported organization base currency exists. V1 supports AED, AUD, CAD, EUR, GBP, INR, SGD, and USD because its ledger has two-decimal precision.';
        END IF;
        ALTER TABLE organizations DROP CONSTRAINT IF EXISTS ck_organizations_currency_code;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_organizations_supported_currency_v1') THEN
          ALTER TABLE organizations ADD CONSTRAINT ck_organizations_supported_currency_v1
          CHECK (base_currency IN ('AED', 'AUD', 'CAD', 'EUR', 'GBP', 'INR', 'SGD', 'USD'));
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_accounts_currency_code') THEN
          ALTER TABLE bank_accounts ADD CONSTRAINT ck_bank_accounts_currency_code CHECK (currency ~ '^[A-Z]{3}$');
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_clients_currency_code') THEN
          ALTER TABLE clients ADD CONSTRAINT ck_clients_currency_code CHECK (currency ~ '^[A-Z]{3}$');
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customers_currency_code') THEN
          ALTER TABLE customers ADD CONSTRAINT ck_customers_currency_code CHECK (currency ~ '^[A-Z]{3}$');
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vendors_currency_code') THEN
          ALTER TABLE vendors ADD CONSTRAINT ck_vendors_currency_code CHECK (currency ~ '^[A-Z]{3}$');
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_journal_line_one_side') THEN
          ALTER TABLE journal_lines ADD CONSTRAINT ck_journal_line_one_side
          CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_invoice_amounts_nonnegative') THEN
          ALTER TABLE invoices ADD CONSTRAINT ck_invoice_amounts_nonnegative
          CHECK (subtotal >= 0 AND tax_total >= 0 AND total_amount >= 0 AND paid_amount >= 0 AND balance_due >= 0);
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payment_received_positive') THEN
          ALTER TABLE payments_received ADD CONSTRAINT ck_payment_received_positive CHECK (amount > 0 AND unallocated_amount >= 0);
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_journal_lines_entry') THEN
          ALTER TABLE journal_lines ADD CONSTRAINT fk_journal_lines_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_journal_lines_account') THEN
          ALTER TABLE journal_lines ADD CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_items_invoice') THEN
          ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_journal_entry') THEN
          ALTER TABLE invoices ADD CONSTRAINT fk_invoices_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bills_journal_entry') THEN
          ALTER TABLE bills ADD CONSTRAINT fk_bills_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_journal_entry') THEN
          ALTER TABLE expenses ADD CONSTRAINT fk_expenses_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_received_journal_entry') THEN
          ALTER TABLE payments_received ADD CONSTRAINT fk_payments_received_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_reversal_journal') THEN
          ALTER TABLE invoices ADD CONSTRAINT fk_invoice_reversal_journal FOREIGN KEY (reversal_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_received_reversal_journal') THEN
          ALTER TABLE payments_received ADD CONSTRAINT fk_payment_received_reversal_journal FOREIGN KEY (reversal_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expense_reversal_journal') THEN
          ALTER TABLE expenses ADD CONSTRAINT fk_expense_reversal_journal FOREIGN KEY (reversal_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_reversal_journal') THEN
          ALTER TABLE bills ADD CONSTRAINT fk_bill_reversal_journal FOREIGN KEY (reversal_journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
        END IF;
      END $$`,
      `CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'audit_logs is append-only';
        END;
      $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs`,
      `CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_id VARCHAR(64)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reporting_group VARCHAR(100)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(6) NOT NULL DEFAULT 'Debit'`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance_is_explicit BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS allow_direct_posting BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS system_role VARCHAR(64)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS financial_statement VARCHAR(32)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cash_flow_classification VARCHAR(32)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3)`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS project_id VARCHAR(64)`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64)`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(64)`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS archived_by VARCHAR(64)`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_invoices_org_id') THEN
          ALTER TABLE invoices ADD CONSTRAINT uk_invoices_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_bills_org_id') THEN
          ALTER TABLE bills ADD CONSTRAINT uk_bills_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_customers_org_id') THEN
          ALTER TABLE customers ADD CONSTRAINT uk_customers_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_clients_org_id') THEN
          ALTER TABLE clients ADD CONSTRAINT uk_clients_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_vendors_org_id') THEN
          ALTER TABLE vendors ADD CONSTRAINT uk_vendors_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_accounts_org_id') THEN
          ALTER TABLE accounts ADD CONSTRAINT uk_accounts_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_credit_notes_org_id') THEN
          ALTER TABLE credit_notes ADD CONSTRAINT uk_credit_notes_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_vendor_credits_org_id') THEN
          ALTER TABLE vendor_credits ADD CONSTRAINT uk_vendor_credits_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_payments_received_org_id') THEN
          ALTER TABLE payments_received ADD CONSTRAINT uk_payments_received_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_payments_made_org_id') THEN
          ALTER TABLE payments_made ADD CONSTRAINT uk_payments_made_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_customer_advances_org_id') THEN
          ALTER TABLE customer_advances ADD CONSTRAINT uk_customer_advances_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_vendor_advances_org_id') THEN
          ALTER TABLE vendor_advances ADD CONSTRAINT uk_vendor_advances_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_journal_entries_org_id') THEN
          ALTER TABLE journal_entries ADD CONSTRAINT uk_journal_entries_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_sales_orders_org_id') THEN
          ALTER TABLE sales_orders ADD CONSTRAINT uk_sales_orders_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_estimates_org_id') THEN
          ALTER TABLE estimates ADD CONSTRAINT uk_estimates_org_id UNIQUE (organization_id, id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_purchase_orders_org_id') THEN
          ALTER TABLE purchase_orders ADD CONSTRAINT uk_purchase_orders_org_id UNIQUE (organization_id, id);
        END IF;
      END $$`,
      `DO $$
      DECLARE
        pra_corrupt_count INT;
        pma_corrupt_count INT;
        cna_corrupt_count INT;
        dna_corrupt_count INT;
      BEGIN
        SELECT COUNT(*) INTO pra_corrupt_count
          FROM payment_received_allocations pra
          LEFT JOIN payments_received p ON p.organization_id = pra.organization_id AND p.id = pra.payment_id
          LEFT JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
         WHERE p.id IS NULL OR i.id IS NULL;

        IF pra_corrupt_count > 0 THEN
          RAISE EXCEPTION 'Migration preflight check failed: % orphaned or cross-tenant payment_received_allocations detected. Foreign key migration aborted without data loss.', pra_corrupt_count;
        END IF;

        SELECT COUNT(*) INTO pma_corrupt_count
          FROM payment_made_allocations pma
          LEFT JOIN payments_made p ON p.organization_id = pma.organization_id AND p.id = pma.payment_id
          LEFT JOIN bills b ON b.organization_id = pma.organization_id AND b.id = pma.bill_id
         WHERE p.id IS NULL OR b.id IS NULL;

        IF pma_corrupt_count > 0 THEN
          RAISE EXCEPTION 'Migration preflight check failed: % orphaned or cross-tenant payment_made_allocations detected. Foreign key migration aborted without data loss.', pma_corrupt_count;
        END IF;

        SELECT COUNT(*) INTO cna_corrupt_count
          FROM credit_note_applications cna
          LEFT JOIN credit_notes c ON c.organization_id = cna.organization_id AND c.id = cna.credit_note_id
          LEFT JOIN invoices i ON i.organization_id = cna.organization_id AND i.id = cna.invoice_id
         WHERE c.id IS NULL OR i.id IS NULL;

        IF cna_corrupt_count > 0 THEN
          RAISE EXCEPTION 'Migration preflight check failed: % orphaned or cross-tenant credit_note_applications detected. Foreign key migration aborted without data loss.', cna_corrupt_count;
        END IF;

        SELECT COUNT(*) INTO dna_corrupt_count
          FROM debit_note_applications dna
          LEFT JOIN vendor_credits vc ON vc.organization_id = dna.organization_id AND vc.id = dna.debit_note_id
          LEFT JOIN bills b ON b.organization_id = dna.organization_id AND b.id = dna.bill_id
         WHERE vc.id IS NULL OR b.id IS NULL;

        IF dna_corrupt_count > 0 THEN
          RAISE EXCEPTION 'Migration preflight check failed: % orphaned or cross-tenant debit_note_applications detected. Foreign key migration aborted without data loss.', dna_corrupt_count;
        END IF;
      END $$`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_received_alloc_payment_org') THEN
          ALTER TABLE payment_received_allocations ADD CONSTRAINT fk_payment_received_alloc_payment_org
          FOREIGN KEY (organization_id, payment_id) REFERENCES payments_received(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_received_alloc_invoice_org') THEN
          ALTER TABLE payment_received_allocations ADD CONSTRAINT fk_payment_received_alloc_invoice_org
          FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_made_alloc_payment_org') THEN
          ALTER TABLE payment_made_allocations ADD CONSTRAINT fk_payment_made_alloc_payment_org
          FOREIGN KEY (organization_id, payment_id) REFERENCES payments_made(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_made_alloc_bill_org') THEN
          ALTER TABLE payment_made_allocations ADD CONSTRAINT fk_payment_made_alloc_bill_org
          FOREIGN KEY (organization_id, bill_id) REFERENCES bills(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_advances_payment_org') THEN
          ALTER TABLE customer_advances ADD CONSTRAINT fk_customer_advances_payment_org
          FOREIGN KEY (organization_id, payment_id) REFERENCES payments_received(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_advances_vendor_org') THEN
          ALTER TABLE vendor_advances ADD CONSTRAINT fk_vendor_advances_vendor_org
          FOREIGN KEY (organization_id, vendor_id) REFERENCES vendors(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cn_app_credit_note_org') THEN
          ALTER TABLE credit_note_applications ADD CONSTRAINT fk_cn_app_credit_note_org
          FOREIGN KEY (organization_id, credit_note_id) REFERENCES credit_notes(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cn_app_invoice_org') THEN
          ALTER TABLE credit_note_applications ADD CONSTRAINT fk_cn_app_invoice_org
          FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dn_app_debit_note_org') THEN
          ALTER TABLE debit_note_applications ADD CONSTRAINT fk_dn_app_debit_note_org
          FOREIGN KEY (organization_id, debit_note_id) REFERENCES vendor_credits(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dn_app_bill_org') THEN
          ALTER TABLE debit_note_applications ADD CONSTRAINT fk_dn_app_bill_org
          FOREIGN KEY (organization_id, bill_id) REFERENCES bills(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_refunds_account_org') THEN
          ALTER TABLE customer_refunds ADD CONSTRAINT fk_customer_refunds_account_org
          FOREIGN KEY (organization_id, refund_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ar_write_off_invoice_org') THEN
          ALTER TABLE ar_write_offs ADD CONSTRAINT fk_ar_write_off_invoice_org
          FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ar_write_off_account_org') THEN
          ALTER TABLE ar_write_offs ADD CONSTRAINT fk_ar_write_off_account_org
          FOREIGN KEY (organization_id, write_off_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ap_write_off_bill_org') THEN
          ALTER TABLE ap_write_offs ADD CONSTRAINT fk_ap_write_off_bill_org
          FOREIGN KEY (organization_id, bill_id) REFERENCES bills(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ap_write_off_vendor_org') THEN
          ALTER TABLE ap_write_offs ADD CONSTRAINT fk_ap_write_off_vendor_org
          FOREIGN KEY (organization_id, vendor_id) REFERENCES vendors(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ap_write_off_account_org') THEN
          ALTER TABLE ap_write_offs ADD CONSTRAINT fk_ap_write_off_account_org
          FOREIGN KEY (organization_id, write_off_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_accounts_parent_org') THEN
          ALTER TABLE accounts ADD CONSTRAINT fk_accounts_parent_org
          FOREIGN KEY (organization_id, parent_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT;
        END IF;
      END $$`,
    ];

    for (const sql of tables) {
      try {
        // pg-mem does not implement PL/pgSQL DO blocks. Runtime services still
        // enforce these invariants in tests; PostgreSQL receives the constraints.
        if (db.isMemoryMode() && (
          sql.trimStart().startsWith('DO $$') ||
          sql.includes('prevent_audit_log_mutation') ||
          sql.includes('audit_logs_immutable') ||
          sql.includes('idx_quotation_templates_one_default_per_org')
        )) continue;
        await queryClient.query(sql);
      } catch (err) {
        if (!db.isMemoryMode() || process.env.NODE_ENV === 'production') {
          console.error('[Migration Fatal Error]', err);
          throw new Error(`Migration failed on statement: ${sql.slice(0, 80)}... Details: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          console.warn('[Migration Warning (Memory Mode)]', err instanceof Error ? err.message : err);
        }
      }
    }

    // Backfill newly introduced system control accounts for existing tenants.
    // Provisioning is idempotent and never overwrites a tenant's existing code.
    const organizations = await queryClient.query('SELECT id FROM organizations');
    for (const organization of organizations.rows) {
      await OrganizationProvisioningService.provisionDefaultChart(queryClient, organization.id);
    }

    await applyPoint1Schema(queryClient);
    await applyIdentitySchema(queryClient);
    await applyEnterpriseHardeningSchema(queryClient);

    await queryClient.query(
      `INSERT INTO schema_migrations (version, description)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [CURRENT_SCHEMA_VERSION, 'FirmBooks v6 enterprise PostgreSQL fortress with RLS, hash-chaining, and integrity views']
    );

    console.log('[Migration] All PostgreSQL tables initialized successfully.');
  }

  public static async isCurrent(): Promise<boolean> {
    try {
      const result = await db.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [CURRENT_SCHEMA_VERSION]
      );
      return result.rows.length === 1;
    } catch {
      return false;
    }
  }
}
