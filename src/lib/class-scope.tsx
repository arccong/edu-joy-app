import { useEffect, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CLASSES, type ClassType } from "@/lib/shared";
import { useAccess } from "@/lib/access";

/** Danh sách lớp mà tài khoản hiện tại được phép xem/thao tác (Quản lý = tất cả). */
export function useMyClasses(): ClassType[] {
  const { isManager, classes } = useAccess();
  return useMemo(
    () => (isManager ? CLASSES : CLASSES.filter((c) => classes.includes(c))),
    [isManager, classes],
  );
}

/**
 * Ô chọn lớp theo phạm vi quyền:
 * - Quản lý / giáo viên nhiều lớp: hiển thị bình thường (chỉ các lớp được phép).
 * - Giáo viên 1 lớp: ẩn hoàn toàn và tự đặt giá trị về lớp đó.
 */
export function ClassSelect({
  value,
  onChange,
  allLabel,
  className,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: ClassType | "Tất cả") => void;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  const my = useMyClasses();

  useEffect(() => {
    if (my.length === 0) return;
    const ok =
      my.includes(value as ClassType) || (Boolean(allLabel) && value === "Tất cả" && my.length > 1);
    if (!ok) onChange(my.length === 1 ? my[0] : allLabel ? "Tất cả" : my[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [my, value, allLabel]);

  if (my.length <= 1) return null;

  const select = (
    <Select value={value} onValueChange={(v) => onChange(v as ClassType | "Tất cả")} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="Tất cả">{allLabel}</SelectItem> : null}
        {my.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!label) return select;
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {select}
    </div>
  );
}
