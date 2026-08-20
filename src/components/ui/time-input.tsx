import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn giờ TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="time"> gốc của trình duyệt nữa (icon đồng
 * hồ mặc định của trình duyệt nằm sát khung nhập, không chỉnh được bằng CSS, nhìn không đồng bộ thiết
 * kế). Gồm 2 ô số riêng — Giờ (0-23) và Phút (0-59):
 * - Gõ số trực tiếp bằng bàn phím (chạm nhẹ để focus rồi gõ, như input thường).
 * - Desktop: trỏ chuột vào ô rồi lăn chuột giữa (wheel) để tăng/giảm — lăn lên = tăng, lăn xuống = giảm.
 * - Mobile: CHẠM VÀ VUỐT dọc trên ô để tăng/giảm — vuốt lên = tăng, vuốt xuống = giảm. Trong lúc vuốt,
 *   hiện 1 "bong bóng" số to nổi phía TRÊN điểm chạm (position: fixed) để thấy rõ giá trị đang chọn,
 *   tránh bị chính ngón tay che mất ô — cách làm quen thuộc ở các thanh trượt (slider) trên mobile.
 *
 * Bong bóng được render qua Portal thẳng ra document.body (không nằm trong cây DOM của TimeInput) — bắt
 * buộc phải làm vậy vì "position: fixed" chỉ neo đúng theo VIEWPORT khi KHÔNG có ancestor nào dùng CSS
 * transform; mà các Dialog trong app đều dùng transform để căn giữa màn hình, nên nếu bong bóng nằm bên
 * trong Dialog thì tọa độ fixed của nó bị tính theo khung Dialog (containing block bị đổi) thay vì theo
 * màn hình thật, dẫn đến lệch khác nhau tùy Dialog đó to/nhỏ/nằm đâu. Render ra ngoài body thì luôn định
 * vị đúng theo tọa độ chạm thực tế trên màn hình, nhất quán ở mọi nơi.
 *
 * Cơ chế wheel và touch đều dùng listener gắn trực tiếp (không phải qua props onWheel/onTouchMove của
 * React) với { passive: false }, vì React tự gắn các listener này ở chế độ passive mặc định nên gọi
 * preventDefault() bên trong sẽ không chặn được việc cuộn/vuốt cả trang.
 *
 * Giữ nguyên "giao diện lập trình" y hệt input cũ (value: chuỗi "HH:MM", onChange nhận {target:{value}})
 * để không phải sửa lại nơi gọi.
 */

export type TimeInputChangeEvent = { target: { value: string } };
export type TimeInputProps = {
  value?: string | null;
  onChange?: (e: TimeInputChangeEvent) => void;
  className?: string;
  disabled?: boolean;
};

const PX_PER_STEP = 18; // số px vuốt/lăn dọc cần để đổi 1 đơn vị
const BUBBLE_OFFSET_Y = 72; // bong bóng số nổi cách điểm chạm bao nhiêu px phía trên

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function wrap(n: number, count: number) {
  return ((n % count) + count) % count;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseHM(value?: string | null): [number, number] {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value || "");
  if (!m) return [0, 0];
  return [clamp(Number(m[1]), 0, 23), clamp(Number(m[2]), 0, 59)];
}

function DragBubble({ x, y, text }: { x: number; y: number; text: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full" style={{ left: x, top: y }}>
      <div className="flex min-w-14 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xl font-bold tabular-nums text-primary-foreground shadow-lg">
        {text}
      </div>
      {/* Mũi tên nhỏ chỉ xuống điểm chạm, cho rõ bong bóng đang gắn với ngón tay nào */}
      <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 bg-primary" />
    </div>,
    document.body,
  );
}

function TimeUnit({
  value,
  max,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  max: number; // 23 (giờ) hoặc 59 (phút)
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(pad2(value));
  const [bubble, setBubble] = React.useState<{ x: number; y: number; text: string } | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    setText(pad2(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      setText(pad2(value));
      return;
    }
    const clamped = clamp(n, 0, max);
    onChange(clamped);
    setText(pad2(clamped));
  };

  // Lăn chuột giữa (Desktop)
  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1; // lăn lên -> tăng, lăn xuống -> giảm
      onChange(wrap(valueRef.current + dir, max + 1));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [max, disabled, onChange]);

  // Chạm và vuốt dọc (Mobile) — kèm bong bóng số nổi phía trên điểm chạm trong lúc vuốt
  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    let startY = 0;
    let startValue = 0;
    let lastSteps = 0;
    let dragging = false;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startValue = valueRef.current;
      lastSteps = 0;
      dragging = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const delta = startY - touch.clientY; // dương = vuốt lên
      if (!dragging && Math.abs(delta) < 6) return; // chưa vượt ngưỡng -> vẫn coi là chạm để gõ
      dragging = true;
      e.preventDefault();
      const steps = Math.trunc(delta / PX_PER_STEP);
      const next = wrap(startValue + steps, max + 1);
      if (steps !== lastSteps) {
        lastSteps = steps;
        onChange(next);
      }
      setBubble({ x: touch.clientX, y: touch.clientY - BUBBLE_OFFSET_Y, text: pad2(next) });
    };
    const onTouchEnd = () => {
      dragging = false;
      setBubble(null);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [max, disabled, onChange]);

  return (
    <>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        onBlur={(e) => commit(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onChange(value >= max ? 0 : value + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onChange(value <= 0 ? max : value - 1);
          }
        }}
        className={cn(
          "h-9 w-10 select-none rounded-md border border-input bg-transparent text-center text-sm tabular-nums shadow-sm",
          "touch-none", // ngăn trình duyệt tự cuộn/zoom trang khi đang vuốt trên ô này
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      {bubble && <DragBubble x={bubble.x} y={bubble.y} text={bubble.text} />}
    </>
  );
}

const TimeInput = React.forwardRef<HTMLDivElement, TimeInputProps>(({ value, onChange, className, disabled }, ref) => {
  const [h, m] = parseHM(value);
  const emit = (nh: number, nm: number) => {
    onChange?.({ target: { value: `${pad2(nh)}:${pad2(nm)}` } });
  };
  return (
    <div ref={ref} className={cn("flex items-center gap-1", className)}>
      <TimeUnit value={h} max={23} disabled={disabled} ariaLabel="Giờ" onChange={(nh) => emit(nh, m)} />
      <span className="text-sm text-muted-foreground">:</span>
      <TimeUnit value={m} max={59} disabled={disabled} ariaLabel="Phút" onChange={(nm) => emit(h, nm)} />
    </div>
  );
});
TimeInput.displayName = "TimeInput";

export { TimeInput };
