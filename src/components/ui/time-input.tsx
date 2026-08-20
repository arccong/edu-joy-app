import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn giờ TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="time"> gốc của trình duyệt nữa (icon đồng
 * hồ mặc định của trình duyệt nằm sát khung nhập, không chỉnh được bằng CSS, nhìn không đồng bộ thiết
 * kế). Gồm 2 ô số riêng — Giờ (0-23) và Phút (0-59) — mỗi ô có thể:
 * - Gõ số trực tiếp bằng bàn phím (chạm nhẹ để focus rồi gõ, như input thường).
 * - Desktop: trỏ chuột vào ô rồi lăn chuột giữa (wheel) để tăng/giảm — lăn lên = tăng, lăn xuống = giảm.
 * - Mobile: CHẠM VÀ VUỐT dọc trên ô để tăng/giảm — vuốt lên = tăng, vuốt xuống = giảm (mỗi ~18px vuốt
 *   được 1 đơn vị). Phân biệt với "chạm nhẹ để gõ số": chỉ khi ngón tay di chuyển vượt quá một ngưỡng
 *   nhỏ mới coi là đang vuốt chỉnh số; chạm rồi nhấc tay ngay (không di chuyển) vẫn focus ô để gõ bàn
 *   phím bình thường.
 *
 * Cả 2 cơ chế wheel và touch đều dùng listener gắn trực tiếp (không phải qua props onWheel/onTouchMove
 * của React) với { passive: false }, vì React tự gắn các listener này ở chế độ passive mặc định nên
 * gọi preventDefault() bên trong sẽ không chặn được việc cuộn/vuốt cả trang.
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

const PX_PER_STEP = 18; // số px vuốt dọc cần để đổi 1 đơn vị

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function wrap(n: number, count: number) {
  return ((n % count) + count) % count;
}

function parseHM(value?: string | null): [number, number] {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value || "");
  if (!m) return [0, 0];
  return [clamp(Number(m[1]), 0, 23), clamp(Number(m[2]), 0, 59)];
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
  const [text, setText] = React.useState(String(value).padStart(2, "0"));
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    setText(String(value).padStart(2, "0"));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      setText(String(value).padStart(2, "0"));
      return;
    }
    const clamped = clamp(n, 0, max);
    onChange(clamped);
    setText(String(clamped).padStart(2, "0"));
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

  // Chạm và vuốt dọc (Mobile)
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
      const delta = startY - e.touches[0].clientY; // dương = vuốt lên
      if (!dragging && Math.abs(delta) < 6) return; // chưa vượt ngưỡng -> vẫn coi là chạm để gõ, không chặn gì
      dragging = true;
      e.preventDefault();
      const steps = Math.trunc(delta / PX_PER_STEP);
      if (steps !== lastSteps) {
        lastSteps = steps;
        onChange(wrap(startValue + steps, max + 1));
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [max, disabled, onChange]);

  return (
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
  );
}

const TimeInput = React.forwardRef<HTMLDivElement, TimeInputProps>(({ value, onChange, className, disabled }, ref) => {
  const [h, m] = parseHM(value);
  const emit = (nh: number, nm: number) => {
    onChange?.({ target: { value: `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}` } });
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
