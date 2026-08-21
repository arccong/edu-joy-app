import * as React from "react";
import { NumberSpinner } from "@/components/ui/number-spinner";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn NGÀY SINH bằng 3 ô số (Ngày/Tháng/Năm) thay vì lịch (Calendar) — vì ngày sinh học sinh thường
 * cần lùi lại ít nhất 4-5 năm, dùng lịch phải bấm lùi tháng rất nhiều lần, chậm. Gõ số trực tiếp (vd gõ
 * "2016" vào ô Năm) nhanh hơn nhiều; vẫn hỗ trợ lăn chuột (Desktop) / vuốt (Mobile) như TimeInput.
 *
 * value/onChange giữ định dạng "YYYY-MM-DD" (giống DateInput) để tương thích với chỗ gọi hiện có.
 */

export type BirthDateInputChangeEvent = { target: { value: string } };
export type BirthDateInputProps = {
  value?: string | null;
  onChange?: (e: BirthDateInputChangeEvent) => void;
  className?: string;
  disabled?: boolean;
};

const MIN_YEAR = 1930;

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseYMD(value?: string | null): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  // Chưa có ngày sinh -> khởi điểm hợp lý (8 tuổi, độ tuổi phổ biến khi bắt đầu học) để đỡ phải cuộn xa
  // từ 1930, KHÔNG tự lưu gì cả cho tới khi người dùng bấm Lưu.
  const now = new Date();
  return [now.getFullYear() - 8, 1, 1];
}

const BirthDateInput = React.forwardRef<HTMLDivElement, BirthDateInputProps>(({ value, onChange, className, disabled }, ref) => {
  const [y, mo, d] = parseYMD(value);
  const maxYear = new Date().getFullYear();

  const emit = (ny: number, nmo: number, nd: number) => {
    const clampedDay = Math.min(nd, daysInMonth(ny, nmo));
    onChange?.({
      target: { value: `${String(ny).padStart(4, "0")}-${String(nmo).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}` },
    });
  };

  return (
    <div ref={ref} className={cn("flex items-center gap-1", className)}>
      <NumberSpinner value={d} min={1} max={daysInMonth(y, mo)} digits={2} disabled={disabled} ariaLabel="Ngày sinh" onChange={(nd) => emit(y, mo, nd)} />
      <span className="text-sm text-muted-foreground">/</span>
      <NumberSpinner value={mo} min={1} max={12} digits={2} disabled={disabled} ariaLabel="Tháng sinh" onChange={(nmo) => emit(y, nmo, d)} />
      <span className="text-sm text-muted-foreground">/</span>
      <NumberSpinner value={y} min={MIN_YEAR} max={maxYear} digits={4} disabled={disabled} ariaLabel="Năm sinh" onChange={(ny) => emit(ny, mo, d)} />
    </div>
  );
});
BirthDateInput.displayName = "BirthDateInput";

export { BirthDateInput };
