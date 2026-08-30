# Autoplan Review: Self-Hosted FirmBooks Identity

**Date:** 2026-08-30  
**Branch:** codex/point-1-features  
**Status:** APPROVED FOR IMPLEMENTATION  
**Mode:** SELECTIVE EXPANSION (Self-Hosted Private Identity Fortress)

---

## 1. Executive Summary & Review Gauntlet

FirmBooks is transitioning to a private, self-hosted, invite-only enterprise identity and access management system operating exclusively behind **Tailscale private HTTPS**. 

| Phase | Lead Reviewer | Key Verdict |
|---|---|---|
| **CEO Review** | Founder/CEO | **PASS** — Zero public attack surface; bootstrap lock after first owner; invite-only workforce onboarding; strict Google attachment to existing identities only. |
| **Design Review** | Lead Designer | **PASS** — Dedicated Security Center UI for owner device controls, visual session revocation, delivery status badges, and streamlined TOTP QR enrollment. |
| **Engineering Review** | Principal Eng | **PASS** — Opaque database-backed sessions with SHA-256 hashing at rest; AES-256-GCM encrypted TOTP secrets; transactional email outbox pattern decoupling API writes from SMTP latency. |
| **DX Review** | Dev Experience | **PASS** — Backward-compatible schema migrations; mockable SMTP and Google OAuth adapters for offline local/CI testing; comprehensive Playwright and Vitest suites. |

---

## 2. Core Architecture & Data Flow

```text
[Tailscale Ingress] (Private TLS Proxy / TRUST_PROXY)
        │
        ▼
[FirmBooks Auth Router] (/api/v1/auth & /api/v1/identity)
        │
        ├── Session Service (Opaque SHA-256 tokens in DB, device fingerprinting, rotation)
        ├── Invite & Verification Engine (Single-use hashed tokens, bootstrap lock)
        ├── Transactional Email Outbox (PostgreSQL outbox_emails + background retry worker)
        ├── Multi-Factor Engine (TOTP RFC 6238, AES-256 encrypted secrets, hashed recovery codes)
        ├── Google OAuth Linker (Strict existing-identity attachment via PKCE & subject verification)
        └── Security Audit Logger (Append-only security_events stream)
```

---

## 3. Database Schema Blueprint (Additive Migration)

```sql
-- 1. Identity credentials & state
CREATE TABLE IF NOT EXISTS user_identities (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  account_state VARCHAR(30) DEFAULT 'INVITED', -- INVITED, EMAIL_VERIFIED, ACTIVE, SUSPENDED, DISABLED
  email_verified_at TIMESTAMP WITH TIME ZONE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Opaque per-device sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  session_token_hash VARCHAR(64) NOT NULL UNIQUE,
  device_name VARCHAR(120),
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, ROTATED, REVOKED, EXPIRED
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. MFA / TOTP configurations
CREATE TABLE IF NOT EXISTS mfa_credentials (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  totp_secret_encrypted TEXT NOT NULL,
  is_enforced BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  recovery_code_hashes JSONB DEFAULT '[]'::jsonb,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Transactional email outbox
CREATE TABLE IF NOT EXISTS outbox_emails (
  id VARCHAR(64) PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  template_type VARCHAR(50) NOT NULL, -- INVITATION, VERIFY_EMAIL, PASSWORD_RESET, SECURITY_ALERT
  payload JSONB NOT NULL,
  delivery_status VARCHAR(30) DEFAULT 'PENDING', -- PENDING, SENT, FAILED, RETRYING
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 5,
  last_error TEXT,
  next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. External OAuth identity links
CREATE TABLE IF NOT EXISTS external_identity_links (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  provider VARCHAR(30) NOT NULL, -- 'google'
  provider_subject VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255) NOT NULL,
  linked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_provider_subject UNIQUE (provider, provider_subject)
);

-- 6. Security audit events
CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64),
  user_id VARCHAR(64),
  event_type VARCHAR(60) NOT NULL, -- LOGIN_SUCCESS, LOGIN_FAILURE, MFA_CHALLENGE, SESSION_REVOKED, etc.
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Implementation Task Roadmap (T1 – T11)

- **T1: NAS Ingress & Trust Proxy** — Configure Tailscale HTTPS proxy rules, `TRUST_PROXY` settings, and HTTPS headers.
- **T2: Identity Schema & Migration** — Add additive migration `2026.08.30-v5-identity-fortress` with tenant-safe composite foreign keys and indexes.
- **T3: Opaque Session Service** — Implement SHA-256 session token hashing, device extraction, auto-rotation on privilege change, and instant revocation APIs.
- **T4: Invite & Verification Lifecycle** — Implement bootstrap registration lock, invite creation, verification token hashing, and state progression (`INVITED` -> `ACTIVE`).
- **T5: Transactional Email Outbox** — Implement asynchronous outbox poller, SMTP provider transporter, exponential backoff, and owner-visible delivery inspection.
- **T6: Anti-Enumeration Recovery** — Single-use password reset links, global session invalidation on reset, and audit trail.
- **T7: Multi-Factor Authentication (TOTP)** — Implement RFC 6238 TOTP, AES-256-GCM secret encryption, hashed recovery codes, and step-up challenge guards.
- **T8: Strict Google OAuth Linking** — Google OAuth callback linking solely to verified existing FirmBooks user identities.
- **T9: Security Center UI** — Responsive Owner dashboard displaying active devices, team members, pending invites, delivery status, and live session revocation.
- **T10: Test & Verification Citadel** — Unit, PostgreSQL concurrency, outbox retry, failure injection, and Playwright E2E browser test suites.
- **T11: Operational Observability** — Structured logging, security metric counters, and runbooks.
