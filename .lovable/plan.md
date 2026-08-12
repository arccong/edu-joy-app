# Nhật ký học tập: ràng buộc ngày học & thumbnail ảnh

## 1. Ràng buộc khi lưu nhật ký
Trong hộp thoại "Ghi nhật ký" (trang Nhật ký học tập):

- Khi chọn "Ngày học", hệ thống kiểm tra ngay:
  - Ngày đó phải trùng lịch học của học sinh được chọn (theo lịch học hiện hành, có tính lịch sử đổi lịch).
  - Buổi học ngày đó phải đã được điểm danh với trạng thái "Đi học".
- Nếu chưa thỏa, nút Lưu bị khóa và hiện chú thích ngay dưới ô ngày:
  - "Ngày này không nằm trong lịch học của học sinh." hoặc
  - "Buổi học ngày này chưa được điểm danh."
- Với bài học chung cả lớp (Múa): yêu cầu có ít nhất một học sinh của lớp đã điểm danh "Đi học" trong ngày đó.
- Kiểm tra tương tự được áp dụng lại khi bấm Lưu (thông báo lỗi bằng toast nếu bỏ qua).

## 2. Thumbnail ảnh đính kèm
- Trong danh sách đính kèm của hộp thoại nhập liệu: mỗi link dạng "Ảnh" hiện thumbnail nhỏ (khoảng 56×56, bo góc, cắt vừa khung) cạnh URL, kèm nút xóa.
- Trong thẻ nhật ký hiển thị ngoài danh sách: nếu có ảnh đính kèm, hàng thumbnail ảnh được đưa lên **trên cùng**, trước tên học sinh và thông tin buổi học; kích thước gọn (cao ~80px trên desktop, ~64px trên mobile), cuộn ngang khi nhiều ảnh.
- Ảnh lỗi/không tải được sẽ tự ẩn thumbnail để không vỡ bố cục.

## Chi tiết kỹ thuật
- Sửa duy nhất `src/components/tabs/LearningTab.tsx`.
- `LogDialog` nhận thêm dữ liệu điểm danh: dùng `useQuery` gọi `listAttendance({ date })` theo ngày đang chọn trong hộp thoại (đã có sẵn server function).
- Kiểm tra lịch học dùng `slotsEffectiveOn` + `dayOfWeekOf` từ `src/lib/shared.ts`, dữ liệu học sinh và `schedule_changes` lấy từ query đã có trong tab.
- Không thay đổi database, server functions hay RLS.
