CREATE TABLE public.ui_labels (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  default_value text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Khác',
  label text NOT NULL DEFAULT '',
  max_len integer NOT NULL DEFAULT 40,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ui_labels TO anon;
GRANT SELECT, UPDATE ON public.ui_labels TO authenticated;
GRANT ALL ON public.ui_labels TO service_role;

ALTER TABLE public.ui_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY ui_labels_read ON public.ui_labels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ui_labels_update ON public.ui_labels FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

CREATE TRIGGER set_updated_at_ui_labels BEFORE UPDATE ON public.ui_labels
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.ui_labels (key, value, default_value, category, label, max_len, sort_order) VALUES
('app.name', 'Quản lý học sinh', 'Quản lý học sinh', 'Thương hiệu', 'Tên app (góc trên bên trái)', 28, 1),
('app.font', 'Be Vietnam Pro', 'Be Vietnam Pro', 'Thương hiệu', 'Font chữ tên app', 40, 2),
('app.tagline', 'Piano · Múa · Vẽ', 'Piano · Múa · Vẽ', 'Thương hiệu', 'Mô tả dưới tên app', 40, 3),
('tab.dashboard', 'Tổng quan', 'Tổng quan', 'Tab điều hướng', 'Tab Tổng quan', 16, 10),
('tab.students', 'Học sinh', 'Học sinh', 'Tab điều hướng', 'Tab Học sinh', 16, 11),
('tab.schedule', 'Lịch học', 'Lịch học', 'Tab điều hướng', 'Tab Lịch học', 16, 12),
('tab.attendance', 'Điểm danh', 'Điểm danh', 'Tab điều hướng', 'Tab Điểm danh', 16, 13),
('tab.learning', 'Nhật ký học tập', 'Nhật ký học tập', 'Tab điều hướng', 'Tab Nhật ký học tập', 20, 14),
('tab.tuition', 'Học phí', 'Học phí', 'Tab điều hướng', 'Tab Học phí', 16, 15),
('tab.notifications', 'Thông báo', 'Thông báo', 'Tab điều hướng', 'Tab Thông báo', 16, 16),
('btn.payment', 'Ghi nhận học phí', 'Ghi nhận học phí', 'Nút trang Tổng quan', 'Nút ghi nhận học phí', 22, 20),
('btn.new_student', 'Học thử', 'Học thử', 'Nút trang Tổng quan', 'Nút học sinh mới / học thử', 22, 21),
('btn.finance', 'Thu / Chi', 'Thu / Chi', 'Nút trang Tổng quan', 'Nút Thu / Chi', 22, 22),
('auth.title', 'Đăng nhập', 'Đăng nhập', 'Trang đăng nhập', 'Tiêu đề trang đăng nhập', 30, 30),
('auth.subtitle', 'Quản lý học sinh · Piano · Múa · Vẽ', 'Quản lý học sinh · Piano · Múa · Vẽ', 'Trang đăng nhập', 'Mô tả dưới tiêu đề', 70, 31);