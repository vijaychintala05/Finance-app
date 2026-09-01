import { DbQueryClient } from './db';

export async function applyIdentitySchema(client: DbQueryClient): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS user_identities (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
      account_state VARCHAR(30) NOT NULL,
      email_verified_at TIMESTAMP WITH TIME ZONE,
      last_login_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      session_token_hash VARCHAR(128) NOT NULL UNIQUE,
      device_name VARCHAR(120),
      ip_address VARCHAR(45),
      user_agent TEXT,
      status VARCHAR(20) NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mfa_credentials (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL UNIQUE,
      totp_secret_encrypted TEXT NOT NULL,
      is_enforced BOOLEAN NOT NULL DEFAULT FALSE,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      recovery_code_hashes JSONB,
      enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS outbox_emails (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64),
      recipient_email VARCHAR(255) NOT NULL,
      template_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      delivery_status VARCHAR(30) NOT NULL,
      retry_count INT NOT NULL DEFAULT 0,
      max_retries INT NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS external_identity_links (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      provider VARCHAR(30) NOT NULL,
      provider_subject VARCHAR(255) NOT NULL,
      provider_email VARCHAR(255) NOT NULL,
      linked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64),
      user_id VARCHAR(64),
      event_type VARCHAR(60) NOT NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organization_password_resets (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64),
      user_id VARCHAR(64) NOT NULL,
      email VARCHAR(320) NOT NULL,
      role VARCHAR(50),
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      requested_by_ip VARCHAR(64),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      revoked_at TIMESTAMP WITH TIME ZONE,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(128) PRIMARY KEY,
      code_verifier VARCHAR(128) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      used_at TIMESTAMP WITH TIME ZONE
    )`,
  ];

  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
    }
  }
}
