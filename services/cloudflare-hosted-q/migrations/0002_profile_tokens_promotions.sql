ALTER TABLE hosted_q_users ADD COLUMN display_name TEXT;
ALTER TABLE hosted_q_users ADD COLUMN company_name TEXT;
ALTER TABLE hosted_q_users ADD COLUMN use_case TEXT;
ALTER TABLE hosted_q_users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hosted_q_users ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS code_token_wallets (
  email TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (email) REFERENCES hosted_q_users(email)
);

CREATE TABLE IF NOT EXISTS code_token_ledger_events (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  reference_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (email) REFERENCES hosted_q_users(email)
);

CREATE INDEX IF NOT EXISTS idx_code_token_ledger_email_created
  ON code_token_ledger_events(email, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_code_token_ledger_source_reference
  ON code_token_ledger_events(source, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS promotion_campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  reward_tokens INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_contacts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES promotion_campaigns(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_contacts_campaign_email
  ON promotion_contacts(campaign_id, email);
