import * as React from "react";
import { Calendar, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Input ngày/tháng dùng icon TỰ VẼ thay vì icon lịch mặc định của trình duyệt.
 * Lý do: icon mặc định (::-webkit-calendar-picker-indicator) trên Android Chrome do hệ điều hành
 * tự vẽ, không tuân theo CSS margin/padding thông thường — gây lệch, sát mép so với các icon khác
 * trong app (như mũi tên của Select). Dùng opacity/absolute để "ẩn" icon gốc KHÔNG đủ trên Android
 * (icon gốc vẫn hiện ra cạnh icon tự vẽ) — phải loại bỏ hẳn bằng display:none. Việc bấm mở lịch vẫn
 * hoạt động bình thường vì trình duyệt luôn cho phép bấm vào bất kỳ đâu trong ô ngày để mở lịch,
 * không chỉ riêng vào icon.
 */
export type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  variant?: "date" | "month";
};

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, variant = "date", ...props }, ref) => {
    const Icon = variant === "month" ? CalendarDays : Calendar;
    return (
      <div className="relative">
        <Input
          type={variant}
          ref={ref}
          className={cn(
            "[&::-webkit-calendar-picker-indicator]:hidden",
            "[&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0",
            "[&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden",
            className,
            "pr-9",
          )}
          {...props}
        />
        <Icon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
