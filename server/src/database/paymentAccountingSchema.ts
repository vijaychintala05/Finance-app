import { db, type DbQueryClient } from './db';

/** Additive schema for source documents introduced by payment-accounting hardening. */
export async function applyPaymentAccountingSchema(client: DbQueryClient): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS bank_transfers (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      transfer_number VARCHAR(64) NOT NULL,
      transfer_date DATE NOT NULL,
      from_bank_account_id VARCHAR(64) NOT NULL,
      to_bank_account_id VARCHAR(64) NOT NULL,
      from_ledger_account_id VARCHAR(64) NOT NULL,
      to_ledger_account_id VARCHAR(64) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      reference VARCHAR(255),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
      journal_entry_id VARCHAR(64) NOT NULL,
      reversal_journal_id VARCHAR(64),
      reversed_at TIMESTAMP WITH TIME ZONE,
      reversed_by VARCHAR(64),
      reversal_reason TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_bank_transfer_num ON bank_transfers (organization_id, transfer_number)`,
    `CREATE TABLE IF NOT EXISTS treasury_transactions (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      transaction_number VARCHAR(96) NOT NULL,
      transaction_type VARCHAR(40) NOT NULL,
      transaction_date DATE NOT NULL,
      monetary_account_id VARCHAR(64) NOT NULL,
      counter_account_id VARCHAR(64) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      principal_amount NUMERIC(15, 2) NOT NULL,
      interest_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
      interest_expense_account_id VARCHAR(64),
      employee_name VARCHAR(255),
      reference VARCHAR(255),
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
      journal_entry_id VARCHAR(64) NOT NULL,
      reversal_journal_id VARCHAR(64),
      reversed_at TIMESTAMP WITH TIME ZONE,
      reversed_by VARCHAR(64),
      reversal_reason TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_org_treasury_transaction_num ON treasury_transactions (organization_id, transaction_number)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_treasury_transaction_original_journal ON treasury_transactions (organization_id, journal_entry_id)`,
    `CREATE INDEX IF NOT EXISTS idx_treasury_transactions_org_date ON treasury_transactions (organization_id, transaction_date DESC)`,
    `ALTER TABLE customer_refunds ADD COLUMN IF NOT EXISTS advance_id VARCHAR(64)`,
    `ALTER TABLE vendor_refunds ADD COLUMN IF NOT EXISTS advance_id VARCHAR(64)`,
    `ALTER TABLE vendor_refunds ADD COLUMN IF NOT EXISTS expense_id VARCHAR(64)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS expense_id VARCHAR(64)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS journal_entry_id VARCHAR(64)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS related_event_id VARCHAR(64)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS reversal_journal_id VARCHAR(64)`,
    `ALTER TABLE payment_gateway_events ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE`,
    `CREATE INDEX IF NOT EXISTS idx_bank_transfers_org_date ON bank_transfers (organization_id, transfer_date DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_payment_received_original_journal ON payments_received (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_payment_made_original_journal ON payments_made (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_customer_advance_original_journal ON customer_advances (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL AND payment_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_vendor_advance_original_journal ON vendor_advances (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL AND payment_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_customer_refund_original_journal ON customer_refunds (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_vendor_refund_original_journal ON vendor_refunds (organization_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_transfer_original_journal ON bank_transfers (organization_id, journal_entry_id)`,
  ];

  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (err) {
      if (!db.isMemoryMode() || process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('[Migration Warning (Memory Mode)]', err instanceof Error ? err.message : err);
    }
  }

  if (!db.isMemoryMode()) {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_transfer_amount_positive') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT ck_bank_transfer_amount_positive CHECK (amount > 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bank_transfer_distinct_accounts') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT ck_bank_transfer_distinct_accounts CHECK (from_bank_account_id <> to_bank_account_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_treasury_transaction_amount_positive') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT ck_treasury_transaction_amount_positive CHECK (amount > 0 AND principal_amount > 0 AND interest_amount >= 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_treasury_transaction_type') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT ck_treasury_transaction_type
        CHECK (transaction_type IN ('PAYROLL_PAYMENT', 'EMPLOYEE_REIMBURSEMENT', 'OWNER_CONTRIBUTION', 'OWNER_WITHDRAWAL', 'LOAN_RECEIVED', 'LOAN_REPAYMENT', 'TAX_PAYMENT'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_treasury_loan_repayment_total') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT ck_treasury_loan_repayment_total
        CHECK ((transaction_type <> 'LOAN_REPAYMENT') OR amount = principal_amount + interest_amount) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_bank_accounts_org_id') THEN
        ALTER TABLE bank_accounts ADD CONSTRAINT uk_bank_accounts_org_id UNIQUE (organization_id, id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_expenses_org_id') THEN
        ALTER TABLE expenses ADD CONSTRAINT uk_expenses_org_id UNIQUE (organization_id, id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customer_refund_one_source') THEN
        ALTER TABLE customer_refunds ADD CONSTRAINT ck_customer_refund_one_source
        CHECK (((credit_note_id IS NOT NULL)::int + (payment_id IS NOT NULL)::int + (advance_id IS NOT NULL)::int) = 1) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vendor_refund_one_source') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT ck_vendor_refund_one_source
        CHECK (((debit_note_id IS NOT NULL)::int + (payment_id IS NOT NULL)::int + (advance_id IS NOT NULL)::int + (expense_id IS NOT NULL)::int) = 1) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_received_journal_org') THEN
        ALTER TABLE payments_received ADD CONSTRAINT fk_payment_received_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_made_journal_org') THEN
        ALTER TABLE payments_made ADD CONSTRAINT fk_payment_made_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_refund_credit_org') THEN
        ALTER TABLE customer_refunds ADD CONSTRAINT fk_customer_refund_credit_org
        FOREIGN KEY (organization_id, credit_note_id) REFERENCES credit_notes(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_refund_payment_org') THEN
        ALTER TABLE customer_refunds ADD CONSTRAINT fk_customer_refund_payment_org
        FOREIGN KEY (organization_id, payment_id) REFERENCES payments_received(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_refund_advance_org') THEN
        ALTER TABLE customer_refunds ADD CONSTRAINT fk_customer_refund_advance_org
        FOREIGN KEY (organization_id, advance_id) REFERENCES customer_advances(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_refund_journal_org') THEN
        ALTER TABLE customer_refunds ADD CONSTRAINT fk_customer_refund_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_refund_debit_org') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT fk_vendor_refund_debit_org
        FOREIGN KEY (organization_id, debit_note_id) REFERENCES vendor_credits(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_refund_payment_org') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT fk_vendor_refund_payment_org
        FOREIGN KEY (organization_id, payment_id) REFERENCES payments_made(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_refund_advance_org') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT fk_vendor_refund_advance_org
        FOREIGN KEY (organization_id, advance_id) REFERENCES vendor_advances(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_refund_expense_org') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT fk_vendor_refund_expense_org
        FOREIGN KEY (organization_id, expense_id) REFERENCES expenses(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_refund_journal_org') THEN
        ALTER TABLE vendor_refunds ADD CONSTRAINT fk_vendor_refund_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_from_bank_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_from_bank_org
        FOREIGN KEY (organization_id, from_bank_account_id) REFERENCES bank_accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_to_bank_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_to_bank_org
        FOREIGN KEY (organization_id, to_bank_account_id) REFERENCES bank_accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_from_ledger_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_from_ledger_org
        FOREIGN KEY (organization_id, from_ledger_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_to_ledger_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_to_ledger_org
        FOREIGN KEY (organization_id, to_ledger_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_journal_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_transfer_reversal_org') THEN
        ALTER TABLE bank_transfers ADD CONSTRAINT fk_bank_transfer_reversal_org
        FOREIGN KEY (organization_id, reversal_journal_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_payment_org') THEN
        ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_gateway_payment_org
        FOREIGN KEY (organization_id, payment_id) REFERENCES payments_received(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_treasury_monetary_account_org') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT fk_treasury_monetary_account_org
        FOREIGN KEY (organization_id, monetary_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_treasury_counter_account_org') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT fk_treasury_counter_account_org
        FOREIGN KEY (organization_id, counter_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_treasury_interest_account_org') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT fk_treasury_interest_account_org
        FOREIGN KEY (organization_id, interest_expense_account_id) REFERENCES accounts(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_treasury_journal_org') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT fk_treasury_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_treasury_reversal_journal_org') THEN
        ALTER TABLE treasury_transactions ADD CONSTRAINT fk_treasury_reversal_journal_org
        FOREIGN KEY (organization_id, reversal_journal_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_invoice_org') THEN
        ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_gateway_invoice_org
        FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_expense_org') THEN
        ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_gateway_expense_org
        FOREIGN KEY (organization_id, expense_id) REFERENCES expenses(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_journal_org') THEN
        ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_gateway_journal_org
        FOREIGN KEY (organization_id, journal_entry_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gateway_reversal_journal_org') THEN
        ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_gateway_reversal_journal_org
        FOREIGN KEY (organization_id, reversal_journal_id) REFERENCES journal_entries(organization_id, id) ON DELETE RESTRICT NOT VALID;
      END IF;
    END $$`);
  }
}
