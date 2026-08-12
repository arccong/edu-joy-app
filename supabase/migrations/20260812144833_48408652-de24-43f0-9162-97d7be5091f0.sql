CREATE TABLE public.trial_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  age integer NOT NULL DEFAULT 0,
  class_type class_type NOT NULL,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '11:00',
  trial_date date NOT NULL,
  status text NOT NULL DEFAULT 'Học thử',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_students TO authenticated;
GRANT ALL ON public.trial_students TO service_role;

ALTER TABLE public.trial_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY trial_students_select ON public.trial_students FOR SELECT TO authenticated
  USING (is_manager() OR teaches(class_type));
CREATE POLICY trial_students_insert ON public.trial_students FOR INSERT TO authenticated
  WITH CHECK (is_manager() OR teaches(class_type));
CREATE POLICY trial_students_update ON public.trial_students FOR UPDATE TO authenticated
  USING (is_manager() OR teaches(class_type)) WITH CHECK (is_manager() OR teaches(class_type));
CREATE POLICY trial_students_delete ON public.trial_students FOR DELETE TO authenticated
  USING (is_manager());

CREATE TRIGGER set_updated_at_trial_students BEFORE UPDATE ON public.trial_students
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();