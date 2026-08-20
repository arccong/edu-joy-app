import { useEffect } from "react";

/**
 * Một số trình duyệt (đặc biệt Chromium/WebKit) không tự vẽ lại chữ BÊN TRONG thẻ <input> khi web font
 * (vd: "Be Vietnam Pro") tải xong muộn hơn lần vẽ đầu tiên (do dùng `display=swap`) — chữ vẫn hiển thị
 * bằng font dự phòng (thường trông nhỏ/khác) cho tới khi có một tương tác nào đó (click, focus...)
 * buộc trình duyệt tính toán lại. Text thường (không phải input) không bị ảnh hưởng vì trình duyệt tự
 * vẽ lại chúng ngay khi font tải xong — chỉ riêng input là có quirk này.
 *
 * Component này ép trình duyệt vẽ lại TẤT CẢ input ngay khi font tải xong, để không cần đợi người dùng
 * tương tác thì chữ mới hiển thị đúng kích cỡ. Dùng CẢ 2 cơ chế cho chắc:
 * 1) document.fonts.ready — chính xác nhất, nhưng một số trình duyệt/WebView cũ hỗ trợ không đầy đủ.
 * 2) Một loạt mốc thời gian cố định (100ms/400ms/1000ms/2000ms) — lưới an toàn dự phòng, không phụ
 *    thuộc API nào, đảm bảo vẫn ép vẽ lại kể cả khi (1) không hoạt động như mong đợi.
 */
function forceRepaintInputs() {
  for (const el of document.querySelectorAll<HTMLElement>("input, textarea")) {
    // Đổi font-size (chứ không phải visibility/display) — buộc trình duyệt phải tính lại đo đạc chữ
    // (text shaping/metrics) từ đầu, đáng tin cậy hơn để "đánh thức" input vẽ lại đúng font đã tải.
    const prev = el.style.fontSize;
    const computed = window.getComputedStyle(el).fontSize;
    el.style.fontSize = "0.01px";
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetWidth; // buộc trình duyệt layout lại ngay với giá trị tạm trước khi đặt lại giá trị thật
    el.style.fontSize = prev || computed;
  }
}

export function FontRepaintFix() {
  useEffect(() => {
    let cancelled = false;

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => {
        if (!cancelled) forceRepaintInputs();
      });
    }

    // Lưới an toàn dự phòng, không phụ thuộc document.fonts — chạy vài mốc trong 2 giây đầu để chắc
    // chắn "đánh thức" input dù document.fonts không hoạt động như kỳ vọng trên thiết bị đang dùng.
    const timers = [100, 400, 1000, 2000].map((ms) => setTimeout(() => !cancelled && forceRepaintInputs(), ms));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);
  return null;
}
