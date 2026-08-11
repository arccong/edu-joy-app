-- Enums
CREATE TYPE public.class_type AS ENUM ('Piano','Múa','Vẽ');
CREATE TYPE public.student_status AS ENUM ('Đang học','Nghỉ phép','Bảo lưu','Kết thúc','Hoàn thành','Chuẩn bị');
CREATE TYPE public.attendance_status AS ENUM ('Đi học','Nghỉ có phép','Nghỉ không phép','Bảo lưu');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- people
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  age integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  name text NOT NULL,
  age integer NOT NULL,
  class_type public.class_type NOT NULL,
  tuition numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.student_status NOT NULL DEFAULT 'Đang học',
  total_sessions integer NOT NULL DEFAULT 0,
  sessions_per_day integer NOT NULL DEFAULT 1,
  schedule_days integer[] NOT NULL DEFAULT '{}',
  schedule_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  reserve_days integer NOT NULL DEFAULT 0,
  course_index integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL,
  status public.attendance_status NOT NULL,
  note text,
  makeup_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- class_schedule
CREATE TABLE public.class_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type public.class_type NOT NULL,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.class_schedule TO service_role;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

-- schedule_changes
CREATE TABLE public.schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  old_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.schedule_changes TO service_role;
ALTER TABLE public.schedule_changes ENABLE ROW LEVEL SECURITY;

-- tuition_payments
CREATE TABLE public.tuition_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_date date NOT NULL DEFAULT current_date,
  ky_index integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tuition_payments TO service_role;
ALTER TABLE public.tuition_payments ENABLE ROW LEVEL SECURITY;

-- learning_logs
CREATE TABLE public.learning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  class_type public.class_type NOT NULL,
  date date NOT NULL,
  title text NOT NULL DEFAULT '',
  content text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_class_wide boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.learning_logs TO service_role;
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;

-- expense_categories
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_amount numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- finance_entries
CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  kind text NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  unit_amount numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  is_fixed boolean NOT NULL DEFAULT false,
  note text,
  class_type text,
  course_label text,
  income_type text,
  student_name text,
  paid_date date,
  term_start date,
  term_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

-- telegram_settings
CREATE TABLE public.telegram_settings (
  id integer PRIMARY KEY DEFAULT 1,
  bot_token text,
  chat_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;

-- updated_at triggers
CREATE TRIGGER set_updated_at_people BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_students BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_tuition BEFORE UPDATE ON public.tuition_payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_learning BEFORE UPDATE ON public.learning_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_expense BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_finance BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_telegram BEFORE UPDATE ON public.telegram_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- reserve extension trigger
CREATE OR REPLACE FUNCTION public.apply_reserve_extension()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reserve_days > COALESCE(OLD.reserve_days, 0) THEN
    NEW.end_date = NEW.end_date + (NEW.reserve_days - COALESCE(OLD.reserve_days, 0));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER students_reserve_extension BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.apply_reserve_extension();

-- seed data
INSERT INTO public.expense_categories (name, default_amount, sort_order) VALUES
  ('Lương giáo viên', 0, 1),
  ('Mặt bằng', 0, 2),
  ('Điện', 0, 3),
  ('Nước', 0, 4),
  ('Thuế', 0, 5);

INSERT INTO public.telegram_settings (id) VALUES (1);