-- Phạm vi hiệu lực của 1 lượt gán giáo viên cho 1 ca — cho phép chọn "áp dụng từ trước tới nay", "áp
-- dụng từ nay trở về sau", hoặc "chỉ trong tuần/tháng này" thay vì mặc định áp dụng cho MỌI thời điểm
-- (cả quá khứ lẫn tương lai) như trước. NULL ở effective_from/effective_to nghĩa là không giới hạn theo
-- hướng đó (vd effective_from=NULL, effective_to='2026-08-22' = áp dụng từ trước tới hết 22/8/2026).
ALTER TABLE public.class_schedule_teachers ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE public.class_schedule_teachers ADD COLUMN IF NOT EXISTS effective_to date;

-- Bỏ ràng buộc UNIQUE cũ (class_type, day_of_week, start_time, end_time, teacher_id) — giờ 1 giáo viên
-- có thể được gán nhiều lượt cho CÙNG 1 ca với các khoảng hiệu lực KHÁC NHAU (vd gán "chỉ tuần này" rồi
-- sau đó gán tiếp "từ nay trở về sau" cho cùng người đó), ràng buộc cũ sẽ chặn nhầm trường hợp hợp lệ này.
-- Tra cứu động thay vì đoán tên constraint tự sinh của Postgres (có thể bị cắt/hash nếu quá dài).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.class_schedule_teachers'::regclass AND contype = 'u';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.class_schedule_teachers DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
