-- ============================================================================
-- Trang "Hồ sơ giáo viên": bổ sung thông tin cố định lên bảng "profiles" (đã là
-- 1 dòng = 1 tài khoản nhân sự), + 3 bảng mới: gán giáo viên theo TỪNG CA cụ thể
-- trên thời khóa biểu (hỗ trợ nhiều giáo viên/1 lớp ngay từ đầu), nghỉ phép, và
-- lương thưởng.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('Nam', 'Nữ'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teacher_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_teacher_code_unique ON public.profiles(teacher_code) WHERE teacher_code IS NOT NULL;

-- Mã giáo viên dạng "LA-G00001" — sinh khi cần (lần đầu mở hồ sơ giáo viên đó), KHÔNG dùng trigger
-- BEFORE INSERT vì lúc tạo dòng profiles chưa chắc đã biết vai trò là giáo viên hay quản lý (vai trò
-- được gán ở bảng user_roles riêng, có thể sau khi tạo profiles). Atomic nhờ sequence.
CREATE SEQUENCE IF NOT EXISTS public.teacher_code_seq;
CREATE OR REPLACE FUNCTION public.next_teacher_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.teacher_code_seq');
  RETURN 'LA-G' || lpad(n::text, 5, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.next_teacher_code() TO authenticated;

-- Gán giáo viên cho TỪNG CA cụ thể trên thời khóa biểu (class_schedule) — không gán theo cả lớp
-- (teacher_classes hiện có chỉ nói "giáo viên X có dạy lớp Y", không phân biệt được ca nào) — để hỗ trợ
-- đúng ngay từ đầu trường hợp 1 lớp có từ 2 giáo viên trở lên dạy các ca khác nhau (hoặc cùng 1 ca).
CREATE TABLE public.class_schedule_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_schedule_id uuid NOT NULL REFERENCES public.class_schedule(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_schedule_id, teacher_id)
);
GRANT ALL ON public.class_schedule_teachers TO service_role;
ALTER TABLE public.class_schedule_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_schedule_teachers_manager_only" ON public.class_schedule_teachers FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule_teachers TO authenticated;

-- Nghỉ phép giáo viên — ghi chép hành chính đơn giản (không có luồng xin/duyệt), Quản lý nhập trực tiếp.
CREATE TABLE public.teacher_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.teacher_leaves TO service_role;
ALTER TABLE public.teacher_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_leaves_manager_only" ON public.teacher_leaves FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_leaves TO authenticated;

-- Lương thưởng giáo viên — ghi nhận từng lần trả, Quản lý nhập trực tiếp (khác "Tài chính" hiện có vốn
-- chỉ ghi thu/chi chung của trung tâm, không tách theo từng người).
CREATE TABLE public.teacher_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  paid_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.teacher_salary_payments TO service_role;
ALTER TABLE public.teacher_salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_salary_manager_only" ON public.teacher_salary_payments FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_salary_payments TO authenticated;

-- Quản lý cần sửa được thông tin hồ sơ (ngày sinh/giới tính/địa chỉ/avatar) của GIÁO VIÊN KHÁC, không
-- chỉ của chính mình — policy update hiện có (profiles_update_own) chỉ cho tự sửa của mình.
CREATE POLICY "profiles_update_manager" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
