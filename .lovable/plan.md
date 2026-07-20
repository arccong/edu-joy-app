## Mục tiêu
Cung cấp cách điểm danh nhanh cho nhiều buổi đã qua nhưng chưa có bản ghi, không phải mở từng ngày một.

## Giải pháp: Nút "Điểm danh bù hàng loạt" trong tab Điểm danh

Thêm 1 nút mới ở header tab Điểm danh (bên cạnh công tắc "Tự động điểm danh") để mở một hộp thoại cho phép bù điểm danh nhiều buổi/nhiều học sinh trong 1 lần.

### Luồng sử dụng
1. Bấm nút **"Điểm danh bù"** → mở dialog.
2. Chọn khoảng thời gian (mặc định: từ `start_date` sớm nhất của học sinh đang chọn → hôm qua).
3. Chọn phạm vi: **Tất cả lớp / Piano / Múa / Vẽ**, hoặc chọn cụ thể 1 học sinh.
4. Hệ thống liệt kê tất cả **buổi học theo lịch** rơi vào khoảng đó **chưa có bản ghi điểm danh** — dạng bảng: `Ngày | Thứ | Học sinh | Lớp | Khung giờ | Trạng thái (dropdown)`.
5. Mỗi dòng mặc định trạng thái = **"Đi học"**. Người dùng có thể:
   - Đổi từng dòng sang Nghỉ có phép / Nghỉ không phép / Bảo lưu.
   - Dùng nút nhanh trên đầu: **"Đặt tất cả = Đi học"** / **"Bỏ chọn dòng này"** (loại khỏi lần lưu).
   - Tick chọn/bỏ chọn từng dòng (checkbox), hoặc "Chọn tất cả".
6. Bấm **"Lưu N buổi"** → gọi `setAttendance` tuần tự cho từng dòng đã tick, hiển thị progress + toast tổng kết.

### Điểm cần lưu ý
- Bỏ qua học sinh có `status = "Kết thúc"` hoặc ngày > `end_date` / < `start_date` của học sinh đó.
- Bỏ qua học sinh đang `Bảo lưu` cho các ngày trong khoảng bảo lưu (giữ đơn giản: nếu status hiện tại là "Bảo lưu" thì loại toàn bộ, người dùng có thể tick lại thủ công).
- Không ghi đè các buổi đã có bản ghi (chỉ hiển thị buổi thiếu).
- Sau khi lưu xong: invalidate query `attendance` để UI cập nhật.

## Tệp sẽ thay đổi
- `src/components/tabs/AttendanceTab.tsx`: thêm nút + dialog + logic sinh danh sách buổi thiếu và lưu hàng loạt.
- Không cần thay đổi database, server function, hay `shared.ts` — dùng lại `setAttendance` và `listAttendanceRange` đã có.

## Chi tiết kỹ thuật
- Sinh danh sách buổi: lặp từng ngày trong khoảng, với mỗi học sinh trong phạm vi kiểm tra `schedule_slots` có slot khớp `day = dow` và ngày nằm trong `[start_date, end_date]`; loại các cặp `(student_id, date)` đã có trong kết quả `listAttendanceRange`.
- Lưu: `for...of` gọi `setAttendance` với `await`; đếm success/fail; toast cuối.
- Dialog dùng `Dialog` shadcn đã có; bảng dùng `Table` shadcn.
