-- Email feature migration
-- Run this in the Supabase SQL editor

-- Synced email cache (individual messages)
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  received_at timestamptz,
  is_read boolean DEFAULT false,
  is_sent boolean DEFAULT false,
  labels text[] DEFAULT '{}',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emails_thread_idx ON emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS emails_received_idx ON emails(received_at DESC);
CREATE INDEX IF NOT EXISTS emails_project_idx ON emails(project_id);
CREATE INDEX IF NOT EXISTS emails_is_sent_idx ON emails(is_sent);

-- AI-extracted task suggestions from emails (pending approval)
CREATE TABLE IF NOT EXISTS email_task_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid REFERENCES emails(id) ON DELETE CASCADE,
  title text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  due_hint text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_tasks_email_idx ON email_task_suggestions(email_id);
CREATE INDEX IF NOT EXISTS email_tasks_status_idx ON email_task_suggestions(status);

-- RLS (permissive like the rest of the app)
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_task_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on emails" ON emails FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on email_task_suggestions" ON email_task_suggestions FOR ALL USING (true) WITH CHECK (true);
