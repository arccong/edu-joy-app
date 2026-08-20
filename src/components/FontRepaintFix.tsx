import { useEffect } from "react";

/**
 * Một số trình duyệt (đặc biệt Chromium/WebKit) không tự vẽ lại chữ BÊN TRONG thẻ <input> khi web font
 * (vd: "Be Vietnam Pro") tải xong muộn hơn lần vẽ đầu tiên (do dùng `display=swap`) — chữ vẫn hiển thị
 * bằng font dự phòng (thường trông nhỏ/khác) cho tới khi có một tương tác nào đó (click, focus...)
 * buộc trình duyệt tính toán lại. Text thường (không phải input) không bị ảnh hưởng vì trình duyệt tự
 * vẽ lại chúng ngay khi font tải xong — chỉ riêng input là có quirk này.
 *
 * Component này ép trình duyệt vẽ lại TẤT CẢ input ngay khi font tải xong (document.fonts.ready), để
 * không cần đợi người dùng tương tác thì chữ mới hiển thị đúng kích cỡ.
 */
export function FontRepaintFix() {
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      for (const el of document.querySelectorAll<HTMLElement>("input, textarea")) {
        const prev = el.style.visibility;
        el.style.visibility = "hidden";
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        el.offsetHeight; // buộc trình duyệt tính toán lại layout/vẽ lại trước khi hiện lại
        el.style.visibility = prev;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
