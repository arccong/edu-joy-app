## Mục tiêu
Trong tab **Điểm danh**, thêm chế độ xem **"Theo học sinh"** để thống kê và chỉnh sửa toàn bộ các buổi trong khóa của một học sinh.

## Thay đổi

### 1. `src/components/tabs/AttendanceTab.tsx`
- Thêm bộ chuyển chế độ ở đầu tab: **Theo ngày** (hiện tại) ↔ **Theo học sinh** (mới).
- Chế độ "Theo học sinh":
  - Combobox chọn học sinh (có tìm kiếm theo tên, lọc theo lớp).
  - Header hiển thị thông tin khóa: tên, lớp, khóa (K1/K2…), ngày bắt đầu, NKT thực tế, tổng buổi.
  - **Khối tổng hợp** (badges): Đi học / Nghỉ có phép / Nghỉ không phép / Bảo lưu / Chưa điểm danh / Tổng theo lịch.
  - **Bảng chi tiết toàn bộ buổi** sinh từ `schedule_slots` giữa `start_date` → NKT thực tế (dùng `slotsPerDayMap` + `addScheduledDays` đã có trong `src/lib/shared.ts`):
    - Cột: STT, Ngày (kèm thứ), Khung giờ, Trạng thái (Select inline: Đi học / Nghỉ có phép / Nghỉ không phép / Bảo lưu / *Chưa điểm danh*), Ghi chú (input), Ngày học bù (date, chỉ khi Nghỉ có phép).
    - Buổi trong tương lai hiển thị mờ, vẫn cho sửa.
    - Highlight dòng "hôm nay".
  - **Sửa inline**: mỗi thay đổi gọi `setAttendance` (đã có sẵn `upsert onConflict student_id,date`); "Chưa điểm danh" → gọi server fn mới `deleteAttendance` để xóa bản ghi.
  - Nút **Lưu tất cả** (tùy chọn) cho các thay đổi hàng loạt trước khi commit.

### 2. `src/lib/students.functions.ts`
- Thêm `deleteAttendance({ student_id, date })` để hỗ trợ đặt lại về "Chưa điểm danh".
- Tái sử dụng `listAttendanceByStudent` đã có để nạp toàn bộ điểm danh của học sinh.

### 3. Không đổi schema DB, không đổi các tab khác.

## Chi tiết kỹ thuật
- Sinh danh sách buổi: lặp ngày từ `start_date` đến ngày kết thúc thực tế (`end_date + reserve_days`), với mỗi ngày dùng `slotsPerDayMap` để biết số buổi và bung theo `schedule_slots` cùng thứ để lấy khung giờ.
- Map với `attendance` theo `date` (nếu có nhiều buổi/ngày, key = `date + slot_index` — nhưng bảng `attendance` hiện chỉ unique theo `(student_id, date)`; giữ nguyên: gộp các slot cùng ngày thành 1 dòng nếu chỉ có 1 ca, hoặc hiển thị 2 dòng cùng ngày với chung 1 trạng thái từ bản ghi ngày đó).
- Query cache key `["attendance-by-student", studentId]`, invalidate sau mỗi mutation.
