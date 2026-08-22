-- "Lương giáo viên" từng được seed sẵn thành 1 dòng DỮ LIỆU trong bảng expense_categories (không phải
-- danh sách gợi ý cứng trong code) từ lúc khởi tạo bảng ban đầu — nên dù đã bỏ "Lương giáo viên" khỏi
-- DEFAULT_EXPENSES trong code, dòng dữ liệu thật này vẫn hiện ra vì expenseChips đọc từ đây. Xóa hẳn vì
-- khoản chi lương giờ có luồng riêng ("Chi lương giáo viên" trong Thêm khoản), không cần gợi ý này nữa.
-- (Không ảnh hưởng các finance_entries cũ đã dùng tên này — category ở đó là text tự do, không phải FK.)
DELETE FROM public.expense_categories WHERE name = 'Lương giáo viên';
