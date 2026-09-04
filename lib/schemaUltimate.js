export const upgradeSql = `
-- RADAR Ultimate in-place upgrade. Everything below is additive and safe to re-run.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS intelligence_mode text NOT NULL DEFAULT 'strategic';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 60;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_changed_at timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS queued_at timestamptz;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE signals ADD COLUMN IF NOT EXISTS relevance integer NOT NULL DEFAULT 50;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS urgency integer NOT NULL DEFAULT 50;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS novelty integer NOT NULL DEFAULT 50;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS credibility integer NOT NULL DEFAULT 70;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS impact_score integer NOT NULL DEFAULT 50;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS claim_type text NOT NULL DEFAULT 'fact';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS move_id text;

CREATE INDEX IF NOT EXISTS idx_sources_priority_due ON sources(status,next_check_at,priority DESC);
CREATE INDEX IF NOT EXISTS idx_signals_workspace_impact ON signals(workspace_id,impact_score DESC,detected_at DESC);

CREATE TABLE IF NOT EXISTS raw_events (
  id text PRIMARY KEY,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id text REFERENCES companies(id) ON DELETE CASCADE,
  source_id text REFERENCES sources(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  external_id text,
  url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_events_workspace ON raw_events(workspace_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS entities (
  id text PRIMARY KEY,
  canonical_name text NOT NULL,
  entity_type text NOT NULL,
  canonical_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type,canonical_name);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id text PRIMARY KEY,
  entity_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id,normalized_alias)
);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_entity_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  target_entity_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  confidence integer NOT NULL DEFAULT 60,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source_entity_id,relation_type,target_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_workspace ON entity_relationships(workspace_id,confidence DESC);

CREATE TABLE IF NOT EXISTS watch_targets (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  label text NOT NULL,
  normalized_key text NOT NULL,
  entity_id text REFERENCES entities(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 60,
  reason text,
  discovered_by text NOT NULL DEFAULT 'company_brain',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,target_type,normalized_key)
);
CREATE INDEX IF NOT EXISTS idx_watch_targets_workspace ON watch_targets(workspace_id,active,priority DESC);

CREATE TABLE IF NOT EXISTS moves (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  move_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  rationale text,
  confidence integer NOT NULL DEFAULT 60,
  impact_score integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'watching',
  recommended_action text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_evidence_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moves_workspace ON moves(workspace_id,impact_score DESC,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_company ON moves(company_id,last_evidence_at DESC);

CREATE TABLE IF NOT EXISTS move_signals (
  move_id text NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  signal_id text NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  contribution integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(move_id,signal_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  move_id text REFERENCES moves(id) ON DELETE SET NULL,
  signal_id text REFERENCES signals(id) ON DELETE SET NULL,
  title text NOT NULL,
  question text NOT NULL,
  context text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'open',
  decided_option text,
  decided_by text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decisions_workspace ON decisions(workspace_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS actions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_id text REFERENCES decisions(id) ON DELETE SET NULL,
  move_id text REFERENCES moves(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  owner text,
  status text NOT NULL DEFAULT 'draft',
  priority integer NOT NULL DEFAULT 60,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_workspace ON actions(workspace_id,status,priority DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS outcomes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_id text REFERENCES actions(id) ON DELETE SET NULL,
  decision_id text REFERENCES decisions(id) ON DELETE SET NULL,
  result text NOT NULL,
  impact integer,
  assessment text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outcomes_workspace ON outcomes(workspace_id,measured_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_preferences (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  category_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  topic_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  minimum_notify_score integer NOT NULL DEFAULT 75,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_minor integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO plans(id,name,monthly_price_minor,currency,entitlements) VALUES
('free','Free',0,'INR','{"companies":3,"monitoring_minutes":1440,"daily_ai_runs":20,"team_members":1}'::jsonb),
('founder','Founder',399900,'INR','{"companies":15,"monitoring_minutes":360,"daily_ai_runs":200,"team_members":2}'::jsonb),
('growth','Growth',1499900,'INR','{"companies":50,"monitoring_minutes":60,"daily_ai_runs":1000,"team_members":8,"war_room":true}'::jsonb),
('business','Business',4999900,'INR','{"companies":200,"monitoring_minutes":15,"daily_ai_runs":5000,"team_members":30,"war_room":true,"api":true}'::jsonb)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,monthly_price_minor=EXCLUDED.monthly_price_minor,currency=EXCLUDED.currency,entitlements=EXCLUDED.entitlements,active=true;

CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES plans(id),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_events(workspace_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_runs (
  id bigserial PRIMARY KEY,
  workspace_id text REFERENCES workspaces(id) ON DELETE SET NULL,
  feature text NOT NULL DEFAULT 'unknown',
  provider text NOT NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  latency_ms integer,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_workspace ON ai_runs(workspace_id,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  object_type text,
  object_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  interval_minutes integer NOT NULL,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,task_key)
);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_due ON recurring_tasks(next_run_at,queued_at);

CREATE TABLE IF NOT EXISTS job_queue (
  id bigserial PRIMARY KEY,
  queue_name text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 50,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_queue_claim ON job_queue(status,available_at,priority DESC,id);

CREATE TABLE IF NOT EXISTS job_runs (
  id bigserial PRIMARY KEY,
  queue_name text NOT NULL,
  message_id bigint,
  job_type text NOT NULL,
  workspace_id text,
  status text NOT NULL,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_runs_created ON job_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS service_heartbeats (
  service text PRIMARY KEY,
  status text NOT NULL DEFAULT 'starting',
  instance_id text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Backfill richer scores for old signals without changing their historical meaning.
UPDATE signals SET
  impact_score=CASE WHEN impact_score=50 THEN importance ELSE impact_score END,
  relevance=CASE WHEN relevance=50 THEN importance ELSE relevance END,
  credibility=CASE WHEN credibility=70 THEN confidence ELSE credibility END
WHERE impact_score=50 OR relevance=50 OR credibility=70;
`;
