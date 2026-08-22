-- "Chi lương" giờ là 1 khoản chi bình thường trong finance_entries (nhập từ Tab Tài chính), chỉ thêm
-- liên kết teacher_id để biết khoản chi lương đó thuộc về giáo viên nào (phục vụ hiển thị "Lương đã
-- nhận" ở Hồ sơ giáo viên) — thay cho bảng teacher_salary_payments riêng biệt trước đó (bỏ, vì tác vụ
-- "Ghi nhận trả lương" nay chuyển hẳn sang Tab Tài chính, Hồ sơ chỉ hiển thị lại, không nhập liệu ở đây).
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_teacher ON public.finance_entries(teacher_id);

DROP TABLE IF EXISTS public.teacher_salary_payments;
