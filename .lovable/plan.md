# Bảng "Danh sách học sinh học thử": bộ lọc, xuất dữ liệu, phân quyền

## 1. Sửa lỗi phân quyền (nguyên nhân đã xác minh)
Kiểm tra database cho thấy bảng `trial_students` **không có bất kỳ quyền truy cập (GRANT) nào** cho vai trò `authenticated` / `service_role`. Vì vậy dù đã có quy tắc RLS theo lớp phụ trách, mọi truy vấn từ ứng dụng đều bị từ chối — giáo viên (và cả quản lý) không thấy bảng này.

Khắc phục bằng một migration:
- Cấp quyền xem/thêm/sửa/xóa cho tài khoản đã đăng nhập, và toàn quyền cho vai trò hệ thống.
- Giữ nguyên các quy tắc RLS hiện có: quản lý xem tất cả; giáo viên chỉ xem/thêm/sửa học sinh học thử thuộc lớp mình phụ trách; chỉ quản lý được xóa.

Sau migration, giáo viên sẽ thấy bảng với dữ liệu lớp mình, nút xóa vẫn ẩn theo quy tắc hiện hành.

## 2. Bộ lọc trạng thái
Thêm ô chọn "Tất cả trạng thái / Học thử / Kết thúc" ở đầu bảng. Trạng thái được tính tự động theo ngày học thử (đã qua ngày = Kết thúc), lọc trên danh sách hiển thị.

## 3. Bộ lọc lớp
Thêm ô chọn lớp dùng đúng thành phần `ClassSelect` như các trang khác: chỉ liệt kê lớp người dùng được phép, có tùy chọn "Tất cả lớp", và tự ẩn nếu giáo viên chỉ phụ trách 1 lớp.

## 4. Nút "Xuất dữ liệu"
Nút xuất Excel (.xlsx) đặt cạnh nút "Học thử", dùng tiện ích `exportXlsx` sẵn có. Xuất đúng các dòng đang hiển thị sau khi lọc, cột: Họ tên, Tuổi, Lớp, Giờ bắt đầu, Giờ kết thúc, Ngày học thử, Trạng thái.

## Chi tiết kỹ thuật
- Migration: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_students TO authenticated; GRANT ALL ... TO service_role;` (không cấp cho `anon`).
- Sửa `src/components/tabs/TrialStudentsCard.tsx`: state `statusFilter` + `classFilter`, `useMemo` lọc danh sách, `ClassSelect` từ `@/lib/class-scope`, `exportXlsx` từ `@/lib/export`, header bố cục co giãn cho mobile.
- Không thay đổi `trials.functions.ts` hay `TrialStudentDialog.tsx`.
