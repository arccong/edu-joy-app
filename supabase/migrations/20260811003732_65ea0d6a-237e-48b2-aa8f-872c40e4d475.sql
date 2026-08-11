CREATE TYPE public.class_type AS ENUM ('Piano', 'Múa', 'Vẽ');
CREATE TYPE public.student_status AS ENUM ('Đang học', 'Nghỉ phép', 'Bảo lưu', 'Kết thúc', 'Hoàn thành', 'Chuẩn bị');
CREATE TYPE public.attendance_status AS ENUM ('Đi học', 'Nghỉ có phép', 'Nghỉ không phép', 'Bảo lưu');

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

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
CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 120),
  class_type public.class_type NOT NULL,
  tuition NUMERIC(12,0) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.student_status NOT NULL DEFAULT 'Đang học',
  reserve_days INTEGER NOT NULL DEFAULT 0,
  total_sessions integer NOT NULL DEFAULT 24,
  schedule_days integer[] NOT NULL DEFAULT '{}'::int[],
  sessions_per_day integer NOT NULL DEFAULT 1,
  schedule_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  course_index integer NOT NULL DEFAULT 1,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT students_sessions_per_day_check CHECK (sessions_per_day IN (1, 2))
);
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_students_person_id ON public.students(person_id);
CREATE TRIGGER students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_reserve_extension()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Bảo lưu' AND (OLD.status IS DISTINCT FROM 'Bảo lưu' OR OLD.reserve_days IS DISTINCT FROM NEW.reserve_days) THEN
    IF NEW.reserve_days > 0 THEN
      NEW.end_date := NEW.end_date + (NEW.reserve_days - COALESCE(OLD.reserve_days,0)) * INTERVAL '1 day';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER students_reserve BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.apply_reserve_extension();

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL,
  note text,
  makeup_date date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_student_date_unique UNIQUE (student_id, date)
);
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type public.class_type NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.class_schedule TO service_role;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

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
CREATE INDEX idx_schedule_changes_student ON public.schedule_changes(student_id, effective_from);

CREATE TABLE public.tuition_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_date date NOT NULL DEFAULT CURRENT_DATE,
  ky_index integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tuition_payments TO service_role;
ALTER TABLE public.tuition_payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tuition_payments_updated_at BEFORE UPDATE ON public.tuition_payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_tuition_payments_month ON public.tuition_payments(month);
CREATE INDEX idx_tuition_payments_student ON public.tuition_payments(student_id);

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
CREATE INDEX idx_learning_logs_student_date ON public.learning_logs(student_id, date);
CREATE INDEX idx_learning_logs_class_date ON public.learning_logs(class_type, date);
CREATE TRIGGER trg_learning_logs_updated_at BEFORE UPDATE ON public.learning_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('thu','chi')),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  is_fixed boolean NOT NULL DEFAULT false,
  class_type text,
  income_type text,
  student_name text,
  course_label text,
  term_start date,
  term_end date,
  paid_date date,
  quantity integer NOT NULL DEFAULT 1,
  unit_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_finance_entries_month ON public.finance_entries(month);
CREATE TRIGGER trg_finance_entries_updated_at BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.telegram_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token TEXT,
  chat_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.telegram_settings (id, bot_token, chat_id) VALUES (1, NULL, NULL);

INSERT INTO public.class_schedule (class_type, day_of_week, start_time, end_time, location) VALUES
  ('Piano', 1, '18:00', '19:30', 'Phòng 101'),
  ('Piano', 4, '18:00', '19:30', 'Phòng 101'),
  ('Múa', 2, '17:00', '18:30', 'Phòng 202'),
  ('Múa', 5, '17:00', '18:30', 'Phòng 202'),
  ('Vẽ', 3, '15:00', '16:30', 'Phòng 303'),
  ('Vẽ', 6, '09:00', '10:30', 'Phòng 303');

INSERT INTO public.expense_categories (name, default_amount, sort_order) VALUES
  ('Lương giáo viên', 0, 1),
  ('Tiền mặt bằng', 0, 2),
  ('Tiền điện', 0, 3),
  ('Tiền nước', 0, 4),
  ('Tiền thuế', 0, 5);