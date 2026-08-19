-- Liên kết học sinh học thử -> học sinh chính thức sau khi "Đăng ký". status có thể nhận thêm giá trị
-- 'Đã đăng ký' (cột status vốn là text tự do, không có CHECK constraint, nên không cần ALTER gì thêm).
ALTER TABLE public.trial_students
  ADD COLUMN IF NOT EXISTS converted_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;
