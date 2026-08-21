import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 1 ô số cuộn được — khối dùng chung cho TimeInput (giờ/phút) và BirthDateInput (ngày/tháng/năm sinh).
 * - Gõ số trực tiếp bằng bàn phím.
 * - Desktop: lăn chuột giữa khi trỏ vào ô để tăng/giảm — lăn lên = tăng, lăn xuống = giảm.
 * - Mobile: chạm và vuốt dọc để tăng/giảm — vuốt lên = tăng, vuốt xuống = giảm, kèm bong bóng số to nổi
 *   phía trên điểm chạm 72px để không bị ngón tay che mất số đang chọn.
 *
 * Cơ chế wheel/touch dùng listener gắn trực tiếp (không qua props onWheel/onTouchMove của React) với
 * { passive: false }, vì React tự gắn các listener này ở chế độ passive mặc định nên gọi
 * preventDefault() bên trong sẽ không chặn được việc cuộn/vuốt cả trang.
 */

const PX_PER_STEP = 18; // số px vuốt/lăn dọc cần để đổi 1 đơn vị
const BUBBLE_OFFSET_Y = 72; // bong bóng số nổi cách điểm chạm bao nhiêu px phía trên

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Cuộn vòng trong khoảng [min, max] (khác wrap 0-based thường gặp, vì đây có thể là min != 0, vd ngày 1-31) */
function wrapInRange(n: number, min: number, max: number) {
  const count = max - min + 1;
  return min + (((n - min) % count) + count) % count;
}

export function DragBubble({ x, y, text }: { x: number; y: number; text: string }) {
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

export function NumberSpinner({
  value,
  min,
  max,
  digits = 2,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: number;
  min: number;
  max: number;
  /** Số chữ số đệm 0 phía trước, vd 2 cho giờ/ngày/tháng, 4 cho năm. */
  digits?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const pad = (n: number) => String(n).padStart(digits, "0");
  const [text, setText] = React.useState(pad(value));
  const [bubble, setBubble] = React.useState<{ x: number; y: number; text: string } | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    setText(pad(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, digits]);

  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      setText(pad(value));
      return;
    }
    const clamped = clamp(n, min, max);
    onChange(clamped);
    setText(pad(clamped));
  };

  // Lăn chuột giữa (Desktop)
  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      onChange(wrapInRange(valueRef.current + dir, min, max));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [min, max, disabled, onChange]);

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
      const next = wrapInRange(startValue + steps, min, max);
      if (steps !== lastSteps) {
        lastSteps = steps;
        onChange(next);
      }
      setBubble({ x: touch.clientX, y: touch.clientY - BUBBLE_OFFSET_Y, text: pad(next) });
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
  }, [min, max, disabled, onChange]);

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
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, digits))}
        onBlur={(e) => commit(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onChange(value >= max ? min : value + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onChange(value <= min ? max : value - 1);
          }
        }}
        className={cn(
          "h-9 select-none rounded-md border border-input bg-transparent text-center text-sm tabular-nums shadow-sm",
          "touch-none", // ngăn trình duyệt tự cuộn/zoom trang khi đang vuốt trên ô này
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          digits >= 4 ? "w-16" : "w-10",
          className,
        )}
      />
      {bubble && <DragBubble x={bubble.x} y={bubble.y} text={bubble.text} />}
    </>
  );
}
