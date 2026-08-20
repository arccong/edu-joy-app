import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn giờ TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="time"> gốc của trình duyệt nữa.
 *
 * Lý do: icon đồng hồ mặc định của input type="time" nằm sát ngay trong khung nhập, không chỉnh được
 * khoảng cách/màu sắc bằng CSS thông thường (do trình duyệt tự vẽ), nhìn không đồng bộ với phong cách
 * thiết kế chung của app. Cùng cách tiếp cận với DateInput: dùng nút (Button) mở Popover chứa danh sách
 * giờ do chính app vẽ ra.
 *
 * Giữ nguyên "giao diện lập trình" y hệt input cũ (value: chuỗi "HH:MM", onChange nhận {target:{value}})
 * để không phải sửa lại nơi gọi.
 */

export type TimeInputChangeEvent = { target: { value: string } };
export type TimeInputProps = {
  value?: string | null;
  onChange?: (e: TimeInputChangeEvent) => void;
  /** Bước nhảy giữa các mốc giờ trong danh sách, tính bằng phút. Mặc định 15 (khớp step={900} cũ). */
  stepMinutes?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

function buildOptions(stepMinutes: number) {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

const TimeInput = React.forwardRef<HTMLButtonElement, TimeInputProps>(
  ({ value, onChange, stepMinutes = 15, className, disabled, placeholder }, ref) => {
    const [open, setOpen] = React.useState(false);
    const listRef = React.useRef<HTMLDivElement>(null);
    const options = React.useMemo(() => buildOptions(stepMinutes), [stepMinutes]);
    const emit = (v: string) => onChange?.({ target: { value: v } });

    React.useEffect(() => {
      if (!open) return;
      // Cuộn tới mốc giờ đang chọn ngay khi mở, cho dễ thấy thay vì phải tự cuộn tìm.
      const el = listRef.current?.querySelector<HTMLElement>(`[data-value="${value}"]`);
      el?.scrollIntoView({ block: "center" });
    }, [open, value]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between px-3 text-left font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{value || placeholder || "Chọn giờ"}</span>
            <Clock className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-28 p-1" align="start">
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {options.map((t) => (
              <button
                key={t}
                type="button"
                data-value={t}
                onClick={() => {
                  emit(t);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                  t === value && "bg-primary/10 font-semibold text-primary",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
TimeInput.displayName = "TimeInput";

export { TimeInput };
