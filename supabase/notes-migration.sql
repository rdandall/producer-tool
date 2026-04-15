-- ─────────────────────────────────────────────────────────────────────────────
-- Notes & Briefs — Phase 1-3 Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand notes.type check constraint ───────────────────────────────────
-- The original constraint only covers 4 types. We add 'note', 'quote',
-- 'idea', 'spec', 'project-update', and keep 'notes' (the existing default).
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_type_check
  CHECK (type IN (
    'brief', 'meeting-notes', 'project-notes', 'client-brief',
    'notes', 'note', 'quote', 'idea', 'spec', 'project-update'
  ));


-- ── 2. Add new columns to notes ─────────────────────────────────────────────
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'saved', 'sent')),
  ADD COLUMN IF NOT EXISTS last_output_type text
    CHECK (last_output_type IS NULL OR last_output_type IN ('email', 'pdf', 'docx')),
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS notes_status_idx ON notes(status);
CREATE INDEX IF NOT EXISTS notes_search_vector_idx ON notes USING GIN(search_vector);


-- ── 3. Full-text search trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notes_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.raw_input, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_search_trigger ON notes;
CREATE TRIGGER notes_search_trigger
  BEFORE INSERT OR UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_search_update();

-- Backfill search vectors for all existing notes
UPDATE notes SET
  search_vector =
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(raw_input, '')), 'C');


-- ── 4. note_versions table (lightweight snapshots) ───────────────────────────
CREATE TABLE IF NOT EXISTS note_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  content     text        NOT NULL,
  title       text        NOT NULL,
  trigger     text        NOT NULL CHECK (trigger IN ('manual-save', 'send', 'export')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_versions_note_id_idx ON note_versions(note_id, created_at DESC);

ALTER TABLE note_versions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'note_versions' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON note_versions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;


-- ── 5. note_attachments table ────────────────────────────────────────────────
-- IMPORTANT: Create a Supabase Storage bucket named "note-attachments" in
-- the Supabase Dashboard → Storage → Create bucket (not public)
-- before the upload API route is used.
CREATE TABLE IF NOT EXISTS note_attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id        uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  storage_path   text        NOT NULL,   -- bucket path: {noteId}/{uuid}-{filename}
  filename       text        NOT NULL,
  mime_type      text        NOT NULL,
  size_bytes     integer     NOT NULL,
  role           text        NOT NULL DEFAULT 'delivery'
                             CHECK (role IN ('context', 'delivery', 'both')),
  extracted_text text,                   -- populated async by /api/notes/attachments/extract
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_attachments_note_id_idx ON note_attachments(note_id);

ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'note_attachments' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON note_attachments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;


-- ── 6. Full-text search helper function ─────────────────────────────────────
-- Called by /api/notes/search via supabase.rpc('search_notes', { q, ... })
CREATE OR REPLACE FUNCTION search_notes(
  q           text,
  filter_type text DEFAULT NULL,
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  title           text,
  type            text,
  raw_input       text,
  content         text,
  project_id      uuid,
  links           jsonb,
  extracted_tasks jsonb,
  status          text,
  last_output_type text,
  created_at      timestamptz,
  updated_at      timestamptz,
  rank            real
) AS $$
DECLARE
  tsq tsquery;
BEGIN
  -- Parse query safely; fall back to prefix match if needed
  BEGIN
    tsq := plainto_tsquery('english', q);
  EXCEPTION WHEN OTHERS THEN
    tsq := NULL;
  END;

  RETURN QUERY
  SELECT DISTINCT ON (n.id)
    n.id, n.title, n.type, n.raw_input, n.content,
    n.project_id, n.links, n.extracted_tasks,
    n.status, n.last_output_type,
    n.created_at, n.updated_at,
    COALESCE(
      CASE WHEN tsq IS NOT NULL THEN ts_rank(n.search_vector, tsq) ELSE 0 END,
      0
    )::real AS rank
  FROM notes n
  LEFT JOIN note_attachments a ON a.note_id = n.id
  WHERE
    (filter_type  IS NULL OR n.type   = filter_type)  AND
    (filter_status IS NULL OR n.status = filter_status) AND
    (
      tsq IS NULL OR
      n.search_vector @@ tsq OR
      n.title ILIKE '%' || q || '%' OR
      (a.filename IS NOT NULL AND a.filename ILIKE '%' || q || '%') OR
      (a.extracted_text IS NOT NULL AND a.extracted_text ILIKE '%' || q || '%')
    )
  ORDER BY n.id, rank DESC, n.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
