import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn giờ TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="time"> gốc của trình duyệt nữa (icon đồng
 * hồ mặc định của trình duyệt nằm sát khung nhập, không chỉnh được bằng CSS, nhìn không đồng bộ thiết
 * kế). Gồm 2 ô số riêng — Giờ (0-23) và Phút (0-59) — mỗi ô có thể:
 * - Gõ số trực tiếp bằng bàn phím.
 * - Lăn chuột giữa (wheel) khi đang trỏ vào ô để tăng/giảm từng đơn vị — lăn lên = tăng, lăn xuống =
 *   giảm. Dùng listener "wheel" gắn trực tiếp (không phải qua React onWheel) với { passive: false } để
 *   preventDefault() chặn được việc cuộn cả trang, vì React tự gắn onWheel ở chế độ passive mặc định
 *   nên gọi preventDefault() trong đó sẽ không có tác dụng chặn cuộn trang.
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
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

  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1; // lăn lên -> tăng, lăn xuống -> giảm
      let next = valueRef.current + dir;
      if (next > max) next = 0;
      if (next < 0) next = max;
      onChange(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
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
        "h-9 w-10 rounded-md border border-input bg-transparent text-center text-sm tabular-nums shadow-sm",
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
