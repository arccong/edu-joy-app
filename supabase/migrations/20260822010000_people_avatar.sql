-- Ảnh đại diện học sinh, hiển thị ở danh sách + trang chi tiết "Hồ sơ học sinh". Có thể chọn từ ảnh đã
-- có trong "Nhật ký học tập" của học sinh đó, hoặc tải ảnh mới lên (dùng chung bucket "learning-media"
-- đã có sẵn policy cho phép Quản lý/Giáo viên upload).
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS avatar_url text;
