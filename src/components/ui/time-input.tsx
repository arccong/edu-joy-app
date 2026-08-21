import * as React from "react";
import { NumberSpinner } from "@/components/ui/number-spinner";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn giờ TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="time"> gốc của trình duyệt nữa (icon đồng
 * hồ mặc định của trình duyệt nằm sát khung nhập, không chỉnh được bằng CSS, nhìn không đồng bộ thiết
 * kế). Gồm 2 ô số riêng — Giờ (0-23) và Phút (0-59), dùng chung khối NumberSpinner (gõ số / lăn chuột /
 * vuốt trên mobile) với BirthDateInput.
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseHM(value?: string | null): [number, number] {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value || "");
  if (!m) return [0, 0];
  return [clamp(Number(m[1]), 0, 23), clamp(Number(m[2]), 0, 59)];
}

const TimeInput = React.forwardRef<HTMLDivElement, TimeInputProps>(({ value, onChange, className, disabled }, ref) => {
  const [h, m] = parseHM(value);
  const emit = (nh: number, nm: number) => {
    onChange?.({ target: { value: `${pad2(nh)}:${pad2(nm)}` } });
  };
  return (
    <div ref={ref} className={cn("flex items-center gap-1", className)}>
      <NumberSpinner value={h} min={0} max={23} digits={2} disabled={disabled} ariaLabel="Giờ" onChange={(nh) => emit(nh, m)} />
      <span className="text-sm text-muted-foreground">:</span>
      <NumberSpinner value={m} min={0} max={59} digits={2} disabled={disabled} ariaLabel="Phút" onChange={(nm) => emit(h, nm)} />
    </div>
  );
});
TimeInput.displayName = "TimeInput";

export { TimeInput };
