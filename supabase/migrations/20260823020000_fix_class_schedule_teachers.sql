-- Bảng "class_schedule" hóa ra KHÔNG được dùng ở đâu trong app cả — "thời khóa biểu" thực tế mà người
-- dùng thấy được tổng hợp trực tiếp từ schedule_slots của TỪNG HỌC SINH (xem ScheduleTab.tsx), không hề
-- lấy từ bảng class_schedule. Vì vậy gán ca dạy dựa theo class_schedule (rỗng) sẽ luôn báo "không có ca
-- nào". Sửa lại: bỏ phụ thuộc bảng class_schedule, lưu trực tiếp (lớp, thứ, giờ bắt đầu-kết thúc) ngay
-- trên chính bảng gán ca — khớp đúng với cách "ca học" thực sự được xác định trong toàn bộ app.
DROP TABLE IF EXISTS public.class_schedule_teachers;

CREATE TABLE public.class_schedule_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type public.class_type NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text NOT NULL, -- "HH:MM", khớp định dạng ScheduleSlot dùng cho schedule_slots của học sinh
  end_time text NOT NULL,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_type, day_of_week, start_time, end_time, teacher_id)
);
GRANT ALL ON public.class_schedule_teachers TO service_role;
ALTER TABLE public.class_schedule_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_schedule_teachers_manager_only" ON public.class_schedule_teachers FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule_teachers TO authenticated;
