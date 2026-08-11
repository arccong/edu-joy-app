# Đăng xuất và Quản lý tài khoản Giáo viên

Hiện tại màn hình chính chưa có nút đăng xuất, và tab Cài đặt chỉ có cấu hình Telegram — phần quản lý tài khoản chưa hiển thị. Backend đã sẵn sàng (tạo giáo viên, gán lớp, xóa tài khoản), chỉ thiếu giao diện.

## 1. Đăng xuất

- Thêm khu vực tài khoản ở góc phải header: hiển thị email, huy hiệu vai trò (Quản lý / Giáo viên) và các lớp phụ trách.
- Nút "Đăng xuất" trong menu tài khoản: hủy các truy vấn đang chạy, xóa cache, gọi Supabase sign out, chuyển về màn hình `/auth`.
- Phiên đăng nhập tự động gia hạn nên hệ thống không tự đăng xuất; chỉ đăng xuất khi bấm nút.

## 2. Quản lý tài khoản Giáo viên (chỉ Quản lý thấy)

Thêm thẻ "Tài khoản người dùng" trong tab Cài đặt, đặt trên phần Telegram:

- Danh sách tất cả tài khoản: email, họ tên, vai trò, lớp phụ trách.
- Nút "Thêm Giáo viên": nhập email, mật khẩu, họ tên, tick chọn lớp (Piano / Múa / Vẽ).
- Tick/bỏ tick lớp phụ trách ngay trên từng dòng để cập nhật.
- Nút xóa tài khoản (không cho tự xóa chính mình), có xác nhận.

## 3. Ẩn theo vai trò

- Giáo viên không thấy tab "Tài chính", "Cài đặt".
- Giáo viên chỉ thấy dữ liệu lớp mình phụ trách và không có nút xóa.

## Hướng dẫn sử dụng sau khi triển khai

1. Đăng nhập bằng tài khoản Quản lý.
2. Vào tab **Cài đặt → Tài khoản người dùng → Thêm Giáo viên**.
3. Nhập email + mật khẩu (tối thiểu 6 ký tự), chọn lớp phụ trách, bấm Tạo.
4. Gửi email/mật khẩu đó cho giáo viên; họ đăng nhập tại màn hình đăng nhập bình thường.
5. Muốn đổi lớp phụ trách: tick/bỏ tick lớp trên dòng của giáo viên đó.

## Chi tiết kỹ thuật

- Sửa `src/routes/_authenticated/index.tsx`: header có `useAccess()` + nút đăng xuất; lọc `TABS` theo `isManager`; thêm component `UsersCard` vào `SettingsTab`.
- Dùng các server function sẵn có trong `src/lib/auth.functions.ts`: `listUsers`, `createTeacher`, `updateTeacherClasses`, `deleteUser` (đều đã kiểm tra quyền Quản lý ở server).
- Không thay đổi cơ sở dữ liệu.
