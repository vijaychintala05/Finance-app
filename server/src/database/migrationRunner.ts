import { db } from './db';

export class MigrationRunner {
  public static async runMigrations(): Promise<void> {
    console.log('[Migration] Starting PostgreSQL schema migrations...');

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
        country VARCHAR(100) DEFAULT 'United States',
        base_currency VARCHAR(10) DEFAULT 'USD',
        currency_symbol VARCHAR(10) DEFAULT '$',
        owner_user_id VARCHAR(64) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uk_org_account_code UNIQUE (organization_id, code)
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
        currency VARCHAR(10) DEFAULT 'INR',
        country VARCHAR(100) DEFAULT 'India',
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
        currency VARCHAR(10) DEFAULT 'INR',
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
        currency VARCHAR(10) DEFAULT 'INR',
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
        currency VARCHAR(10) DEFAULT 'USD',
        payment_terms VARCHAR(50) DEFAULT 'Net 30',
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
        currency VARCHAR(10) DEFAULT 'INR',
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
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS year INT`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS month INT`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS period_name VARCHAR(50)`,
      `ALTER TABLE period_locks ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS revision_number INT DEFAULT 0`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ALLOCATED'`,
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
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR'`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS default_expense_account_id VARCHAR(64)`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS unused_credits NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS advance_balance NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15, 2) DEFAULT 0.00`,
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
        CONSTRAINT uk_org_entity_approval UNIQUE (organization_id, entity_type)
      )`,

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
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS terms TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_token VARCHAR(128)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS items JSONB`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS line_items JSONB`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS overall_discount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15, 2) DEFAULT 0.00`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS is_gst_inclusive BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS template_id VARCHAR(64)`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS validity_days INT DEFAULT 30`,
      `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_response_notes TEXT`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50)`
    ];

    for (const sql of tables) {
      try {
        await db.query(sql);
      } catch (err) {
        if (!db.isMemoryAllowed() || process.env.NODE_ENV === 'production') {
          console.error('[Migration Fatal Error]', err);
          throw new Error(`Migration failed on statement: ${sql.slice(0, 80)}... Details: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          console.warn('[Migration Warning (Memory Mode)]', err instanceof Error ? err.message : err);
        }
      }
    }

    console.log('[Migration] All PostgreSQL tables initialized successfully.');
  }
}
