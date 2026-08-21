-- ============================================================================
-- Trang "Hồ sơ học sinh": bổ sung thông tin cố định của học sinh (ngày sinh,
-- giới tính, mã học sinh) trên bảng "people" (đã là nơi đại diện 1 NGƯỜI, nối
-- các khóa học qua students.person_id), và thêm bảng phụ huynh (guardians) +
-- bảng nối nhiều-nhiều (student_guardians).
-- ============================================================================

-- Không thay thế cột "age" hiện có trên students (đang dùng ở nhiều nơi cho học
-- phí/lịch mặc định) — birth_date chỉ phục vụ hiển thị chính xác trên trang Hồ
-- sơ học sinh, tính tuổi tại thời điểm xem thay vì phải nhập tay mỗi khóa.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('Nam', 'Nữ'));
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS student_code text;

-- Mã học sinh dạng "LA-000001", sinh TỰ ĐỘNG ở DB qua sequence (atomic, không
-- do frontend tự tính để tránh trùng/đụng độ khi nhiều người cùng tạo lúc).
CREATE SEQUENCE IF NOT EXISTS public.people_student_code_seq;

-- Backfill mã cho các hồ sơ đã có sẵn trước khi thêm tính năng này, đánh số
-- theo thứ tự tạo (created_at) cho có ý nghĩa.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM public.people
  WHERE student_code IS NULL
)
UPDATE public.people p
SET student_code = 'LA-' || lpad(ordered.rn::text, 6, '0')
FROM ordered
WHERE p.id = ordered.id;

-- Đẩy sequence vượt qua số đã backfill, để mã mới sinh ra tiếp theo không trùng.
SELECT setval('public.people_student_code_seq', (SELECT count(*) FROM public.people WHERE student_code IS NOT NULL));

ALTER TABLE public.people ALTER COLUMN student_code SET NOT NULL;
ALTER TABLE public.people ADD CONSTRAINT people_student_code_unique UNIQUE (student_code);

CREATE OR REPLACE FUNCTION public.tg_assign_student_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.student_code IS NULL THEN
    NEW.student_code := 'LA-' || lpad(nextval('public.people_student_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_people_assign_student_code BEFORE INSERT ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_student_code();

-- ============================================================================
-- Phụ huynh
-- ============================================================================
CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('Bố', 'Mẹ', 'Ông nội', 'Bà nội', 'Ông ngoại', 'Bà ngoại', 'Khác')),
  phone text,
  email text,
  note text,
  -- Dành chỗ cho tính năng đăng nhập xem nhật ký học tập bằng hình ảnh (làm sau) —
  -- chưa có logic đăng nhập thật, chỉ đặt cột trước để không phải sửa schema lần nữa.
  portal_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.guardians TO service_role;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_guardians_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "guardians_manager_only" ON public.guardians FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardians TO authenticated;

-- Nối nhiều-nhiều: 1 học sinh có thể có nhiều phụ huynh; để dành cho tương lai,
-- 1 phụ huynh cũng có thể được gắn cho nhiều học sinh (anh chị em ruột...).
CREATE TABLE public.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, guardian_id)
);
GRANT ALL ON public.student_guardians TO service_role;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_guardians_manager_only" ON public.student_guardians FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
CREATE INDEX idx_student_guardians_person ON public.student_guardians(person_id);
CREATE INDEX idx_student_guardians_guardian ON public.student_guardians(guardian_id);
