-- Add attachments column to emails table
-- Run this in the Supabase SQL editor

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
