-- Tiêu đề trang đăng nhập giờ được viết cố định thẳng trong code ("Hoạt động trung tâm"), không còn đọc
-- từ bảng ui_labels nữa (đọc từ Supabase bất đồng bộ khiến trang luôn hiện chữ mặc định trước rồi mới
-- đổi sang chữ đã tùy chỉnh — không thể tránh khỏi hiện tượng nháy chữ khi làm theo cách cũ). Xóa dòng
-- này khỏi bảng để mục "Tiêu đề trang đăng nhập" không còn hiện trong trang Cài đặt → Tên gọi hiển thị.
DELETE FROM public.ui_labels WHERE key = 'auth.title';
