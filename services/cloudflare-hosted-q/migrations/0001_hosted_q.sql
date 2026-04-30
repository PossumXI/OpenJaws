CREATE TABLE IF NOT EXISTS hosted_q_users (
  email TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  monthly_credits INTEGER NOT NULL,
  credits_remaining INTEGER NOT NULL,
  requests_this_month INTEGER NOT NULL DEFAULT 0,
  tokens_this_month INTEGER NOT NULL DEFAULT 0,
  resets_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS hosted_q_api_keys (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  label TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (email) REFERENCES hosted_q_users(email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hosted_q_api_keys_hash
  ON hosted_q_api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_hosted_q_api_keys_email
  ON hosted_q_api_keys(email);

CREATE TABLE IF NOT EXISTS hosted_q_usage_events (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  credit_delta INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (email) REFERENCES hosted_q_users(email)
);

CREATE INDEX IF NOT EXISTS idx_hosted_q_usage_events_email_created
  ON hosted_q_usage_events(email, created_at);

CREATE TABLE IF NOT EXISTS laas_ledger_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  subject TEXT NOT NULL,
  visibility TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_laas_ledger_events_visibility_created
  ON laas_ledger_events(visibility, created_at);

CREATE TABLE IF NOT EXISTS mail_receipts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_receipts_created
  ON mail_receipts(created_at);
