import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Ô tìm kiếm theo tên: gõ text để lọc trực tiếp, đồng thời hiện gợi ý (danh sách tên khớp) để bấm chọn
 * nhanh mà không cần gõ hết. `names` nên là danh sách tên trong PHẠM VI đang lọc (vd: đã áp bộ lọc lớp),
 * để gợi ý luôn khớp với những gì đang hiển thị trong bảng.
 */
export function NameSearchInput({
  value,
  onChange,
  names,
  placeholder = "Tìm theo tên học sinh...",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  names: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const uniq = Array.from(new Set(names.filter(Boolean)));
    return uniq.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [value, names]);

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={`relative ${className ?? ""}`}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            placeholder={placeholder}
            className="pl-8 pr-7"
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {value && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-56 overflow-y-auto">
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
