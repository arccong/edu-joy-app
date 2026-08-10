# Trang Tổng quan (Dashboard)

Tab **Tổng quan** đặt đầu tiên và mở mặc định khi vào app. Ưu tiên thông tin vận hành trong ngày, không có biểu đồ phân tích.

## Bố cục từ trên xuống

**1. Lời chào + tóm tắt 1 câu**
- Chào theo thời gian: "Chào buổi sáng/chiều/tối" + thứ, ngày hôm nay.
- Một câu khái quát tự sinh, ví dụ: "Hôm nay có 8 buổi học, 5 đã điểm danh, 2 học sinh nghỉ, 3 việc cần xử lý."

**2. Hàng 4 thẻ KPI** (mỗi thẻ: số lớn + dòng phụ ngữ cảnh + bấm vào chuyển sang tab tương ứng)
- Học sinh đang học — phụ: số đang bảo lưu / chuẩn bị → tab Học sinh
- Lịch học hôm nay — phụ: số buổi đã qua / còn lại trong ngày → tab Lịch học
- Tỷ lệ điểm danh hôm nay — phụ: "x/y đã điểm danh" → tab Điểm danh
- Cần xử lý — phụ: gộp số cảnh báo (sắp hết hạn + sắp hết buổi + chưa đóng học phí) → cuộn tới khối cảnh báo

**3. Lịch học hôm nay + điểm danh nhanh** (cột trái, khối chính)
- Danh sách theo khung giờ: tên học sinh, mã khóa (VD: P2), lớp, giờ học.
- Đánh dấu trạng thái: chưa điểm danh / đã điểm danh (Đi học, Nghỉ CP, Nghỉ KP), và nhãn "Sắp tới giờ" cho buổi gần nhất.
- 3 nút bấm ngay trên từng dòng: Đi học / Nghỉ CP / Nghỉ KP, tôn trọng đúng quy tắc hiện có (chỉ cho "Đi học" từ trước 20 phút so với giờ bắt đầu).
- Học sinh đang trong thời gian bảo lưu không nằm trong danh sách điểm danh, mà hiển thị ở khối riêng bên dưới: "Nghỉ / Bảo lưu hôm nay" (tên, lớp, lý do: bảo lưu hoặc đã điểm danh nghỉ).

**4. Cần xử lý (cảnh báo)** (cột phải)
Ba nhóm, mỗi dòng có nút hành động tương ứng:
- Sắp hết hạn khóa (trong 7 ngày tới) → nút "Ghi nhận học phí"
- Sắp hết buổi (còn ≤ 2 buổi) → nút "Ghi nhận học phí"
- Học phí chưa đóng (khóa đang học/đã kết thúc chưa có bản ghi thanh toán) → nút "Ghi nhận học phí"

**5. Hoạt động gần đây**
- Dòng thời gian gộp 15–20 sự kiện mới nhất: điểm danh, đóng học phí, đổi lịch học, thêm lịch bảo lưu, nhật ký học tập mới.
- Mỗi dòng: icon theo loại, nội dung tiếng Việt ngắn, thời gian tương đối ("12 phút trước").

**6. Thanh thao tác nhanh** (nổi ở đầu trang, dạng nút)
- Ghi nhận học phí (mở popup của trang Học phí)
- Học sinh mới (mở popup StudentDialog)
- Thêm khoản thu / chi (mở popup của trang Tài chính)

## Ghi chú kỹ thuật

- Không cần thay đổi cơ sở dữ liệu. Mọi dữ liệu lấy từ các server function sẵn có: `listStudents`, `listAttendance`, `listPayments`, `listFinanceEntries`, `listScheduleChanges`, `listLearningLogs`; dòng thời gian dựng từ trường `created_at` của các bảng tương ứng.
- File mới `src/components/tabs/DashboardTab.tsx`, tách các khối lớn thành sub-component trong cùng thư mục nếu file vượt ~300 dòng.
- Thêm mục `{ value: "dashboard", label: "Tổng quan", Icon: LayoutDashboard }` vào đầu mảng `TABS` trong `src/routes/index.tsx`, đổi state mặc định thành `"dashboard"`; lưới tab desktop chuyển từ 8 sang 9 cột.
- Các KPI/khối bấm vào sẽ gọi `setTab(...)` — truyền `onNavigate` prop từ `App` xuống `DashboardTab`.
- Điểm danh nhanh dùng `setAttendance` + `useMutation`, invalidate `["attendance", todayISO]` và `["students"]` như các tab hiện có.
- Tái sử dụng `RecordPaymentDialog` (TuitionTab), `StudentDialog`, và dialog thu/chi của FinanceTab bằng cách export chúng, không viết lại form.
- Tính buổi còn lại / bảo lưu / trạng thái dùng đúng helper trong `src/lib/shared.ts` (`effectiveStatus`, `slotsEffectiveOn`, `slotSessions`, `describeSlots`) để số liệu khớp với các trang khác.
- Responsive: 1 cột trên mobile, 2 cột từ `lg`, KPI 2x2 trên mobile và 4 cột trên desktop.
