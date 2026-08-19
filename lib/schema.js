export const schemaSql = `
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Founder',
  target_market text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  website text,
  is_primary boolean NOT NULL DEFAULT false,
  classification text NOT NULL DEFAULT 'watchlist',
  status text NOT NULL DEFAULT 'active',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_workspace_class ON companies(workspace_id, classification);

CREATE TABLE IF NOT EXISTS company_profiles (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  industry text,
  subcategory text,
  summary text,
  problem_use_case text,
  target_customers jsonb NOT NULL DEFAULT '[]'::jsonb,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  geography jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_model text,
  pricing text,
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  positioning text,
  messaging text,
  public_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relationships (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  similarity integer NOT NULL DEFAULT 0,
  threat integer NOT NULL DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0,
  score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  evidence_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, source_company_id, target_company_id)
);
CREATE INDEX IF NOT EXISTS idx_relationships_workspace_status ON relationships(workspace_id, status);

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  source_type text NOT NULL DEFAULT 'website',
  access_method text NOT NULL DEFAULT 'public_web',
  reliability integer NOT NULL DEFAULT 70,
  check_frequency_minutes integer NOT NULL DEFAULT 360,
  status text NOT NULL DEFAULT 'active',
  health text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  next_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, company_id, url)
);
CREATE INDEX IF NOT EXISTS idx_sources_due ON sources(status, next_check_at);
CREATE INDEX IF NOT EXISTS idx_sources_workspace ON sources(workspace_id);

CREATE TABLE IF NOT EXISTS snapshots (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  content_text text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_snapshots_source_fetched ON snapshots(source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS signals (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  previous_state text,
  new_state text,
  importance integer NOT NULL DEFAULT 50,
  confidence integer NOT NULL DEFAULT 50,
  impact text,
  explanation text,
  suggested_action text,
  fact_or_inference text NOT NULL DEFAULT 'fact',
  event_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signals_workspace_detected ON signals(workspace_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_workspace_importance ON signals(workspace_id, importance DESC);

CREATE TABLE IF NOT EXISTS evidence (
  id text PRIMARY KEY,
  signal_id text REFERENCES signals(id) ON DELETE CASCADE,
  company_id text REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_title text,
  excerpt text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  reliability integer NOT NULL DEFAULT 70
);
CREATE INDEX IF NOT EXISTS idx_evidence_signal ON evidence(signal_id);
CREATE INDEX IF NOT EXISTS idx_evidence_company ON evidence(company_id);

CREATE TABLE IF NOT EXISTS scans (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scan_type text NOT NULL DEFAULT 'initial',
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scans_workspace_created ON scans(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS briefings (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefings_workspace_created ON briefings(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id text NOT NULL,
  feedback_type text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_workspace ON feedback(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integrations (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  secret_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,type,label)
);
CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  signal_id text REFERENCES signals(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id,created_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  min_importance integer NOT NULL DEFAULT 75,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
