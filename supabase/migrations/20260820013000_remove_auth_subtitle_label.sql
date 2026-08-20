-- Dòng mô tả dưới tiêu đề trang đăng nhập ("Quản lý học sinh · Piano · Múa · Vẽ") đã được bỏ khỏi UI
-- trang đăng nhập từ trước — xóa nốt dòng này khỏi ui_labels để mục "Mô tả dưới tiêu đề" không còn hiện
-- trong trang Cài đặt → Tên gọi hiển thị (giữ lại chỉ gây nhầm lẫn vì không còn tác dụng gì nữa).
DELETE FROM public.ui_labels WHERE key = 'auth.subtitle';
