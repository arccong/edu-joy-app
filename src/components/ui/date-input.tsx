import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn ngày/tháng TỰ XÂY DỰNG HOÀN TOÀN, không dùng <input type="date"/"month"> gốc của
 * trình duyệt nữa.
 *
 * Lý do: icon lịch mặc định trên Android do chính hệ điều hành vẽ ở tầng thấp hơn cả trình duyệt —
 * mọi cách ẩn bằng CSS (opacity, display:none, ::-webkit-calendar-picker-indicator...) đều không
 * ăn, gây hiện tượng 2 icon chồng nhau. Cách duy nhất chắc chắn 100% trên mọi thiết bị là không
 * dùng input gốc nữa — thay bằng nút bấm (Button) mở Popover chứa lịch chọn (Calendar) do chính
 * app vẽ ra, không phụ thuộc bất kỳ engine hiển thị nào của hệ điều hành.
 *
 * Vẫn giữ nguyên "giao diện lập trình" y hệt input cũ (value: chuỗi ISO "yyyy-MM-dd" hoặc
 * "yyyy-MM", onChange nhận {target:{value}}) để không phải sửa lại nơi gọi.
 */

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function parseISODate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDateVN(value?: string) {
  const d = parseISODate(value);
  return d ? d.toLocaleDateString("vi-VN") : "";
}

function fmtMonthVN(value?: string) {
  if (!value) return "";
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return "";
  return `Th${m}/${y}`;
}

export type DateInputChangeEvent = { target: { value: string } };
export type DateInputProps = {
  value?: string | null;
  onChange?: (e: DateInputChangeEvent) => void;
  variant?: "date" | "month";
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `Th${i + 1}`);

const DateInput = React.forwardRef<HTMLButtonElement, DateInputProps>(
  ({ value, onChange, variant = "date", className, disabled, placeholder }, ref) => {
    const [open, setOpen] = React.useState(false);
    const isMonth = variant === "month";
    const label = isMonth ? fmtMonthVN(value ?? "") : fmtDateVN(value ?? "");

    const now = new Date();
    const [vy, vm] = (value || "").split("-").map(Number);
    const viewYear = isMonth ? (vy || now.getFullYear()) : now.getFullYear();
    const selectedMonth = isMonth ? (vm || null) : null;

    const emit = (v: string) => onChange?.({ target: { value: v } });

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
              !label && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{label || placeholder || (isMonth ? "Chọn tháng" : "Chọn ngày")}</span>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {isMonth ? (
            <div className="w-56 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => emit(`${viewYear - 1}-${String(selectedMonth ?? now.getMonth() + 1).padStart(2, "0")}`)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold">{viewYear}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => emit(`${viewYear + 1}-${String(selectedMonth ?? now.getMonth() + 1).padStart(2, "0")}`)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_LABELS.map((lbl, i) => {
                  const mm = i + 1;
                  const active = mm === selectedMonth && viewYear === vy;
                  return (
                    <Button
                      key={mm}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => {
                        emit(`${viewYear}-${String(mm).padStart(2, "0")}`);
                        setOpen(false);
                      }}
                    >
                      {lbl}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Calendar
              mode="single"
              selected={parseISODate(value ?? "")}
              defaultMonth={parseISODate(value ?? "") ?? now}
              onSelect={(d) => {
                if (d) emit(toISO(d));
                setOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
