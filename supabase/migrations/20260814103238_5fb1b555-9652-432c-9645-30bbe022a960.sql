ALTER TABLE public.trial_students
  ADD COLUMN IF NOT EXISTS attendance_status text,
  ADD COLUMN IF NOT EXISTS attendance_note text,
  ADD COLUMN IF NOT EXISTS attendance_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_history jsonb NOT NULL DEFAULT '[]'::jsonb;