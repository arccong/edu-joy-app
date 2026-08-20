import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UiLabel = {
  key: string;
  value: string;
  default_value: string;
  category: string;
  label: string;
  max_len: number;
  sort_order: number;
};

/** Fallback khi bảng trống / lỗi mạng */
export const LABEL_FALLBACKS: Record<string, string> = {
  "app.name": "Quản lý học sinh",
  "app.font": "Be Vietnam Pro",
  "app.tagline": "Piano · Múa · Vẽ",
  "tab.dashboard": "Tổng quan",
  "tab.students": "Học sinh",
  "tab.schedule": "Lịch học",
  "tab.attendance": "Điểm danh",
  "tab.learning": "Nhật ký học tập",
  "tab.tuition": "Học phí",
  "tab.notifications": "Thông báo",
  "btn.payment": "Ghi nhận học phí",
  "btn.new_student": "Học thử",
  "btn.finance": "Thu / Chi",
  "auth.title": "Đăng nhập",
  "auth.subtitle": "Quản lý học sinh · Piano · Múa · Vẽ",
};

/** Font gợi ý cho tên app (phổ thông / cổ điển / vintage, hỗ trợ tiếng Việt) */
export const APP_FONTS = [
  { value: "Be Vietnam Pro", label: "Be Vietnam Pro (mặc định, hiện đại)" },
  { value: "Playfair Display", label: "Playfair Display (cổ điển)" },
  { value: "Cormorant Garamond", label: "Cormorant Garamond (cổ điển, thanh mảnh)" },
  { value: "Lora", label: "Lora (serif mềm mại)" },
  { value: "Merriweather", label: "Merriweather (vintage, chắc chắn)" },
  { value: "Bitter", label: "Bitter (vintage, máy chữ)" },
  { value: "Roboto Slab", label: "Roboto Slab (slab hiện đại)" },
  { value: "Fraunces", label: "Fraunces (serif ấm, tối giản hiện đại)" },
  { value: "Libre Baskerville", label: "Libre Baskerville (cổ điển, dễ đọc)" },
] as const;

export const labelsKey = ["ui-labels"] as const;

export async function fetchLabels(): Promise<UiLabel[]> {
  const { data } = await supabase.from("ui_labels").select("*").order("sort_order", { ascending: true });
  return (data as UiLabel[] | null) ?? [];
}

export function useLabels() {
  return useQuery({ queryKey: labelsKey, queryFn: fetchLabels, staleTime: 60_000 });
}

/** Trả về hàm t(key) đọc nhãn (có fallback) */
export function useLabel() {
  const { data } = useLabels();
  return (key: string) => {
    const row = data?.find((l) => l.key === key);
    const v = (row?.value || "").trim();
    return v || row?.default_value || LABEL_FALLBACKS[key] || key;
  };
}
