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

const LABELS_CACHE_KEY = "ui-labels-cache-v1";

function readCachedLabels(): UiLabel[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(LABELS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedLabels(rows: UiLabel[] | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (rows && rows.length > 0) window.localStorage.setItem(LABELS_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Bỏ qua nếu localStorage bị chặn (chế độ ẩn danh, v.v) — chỉ mất phần cache "vẽ trước".
  }
}

export async function fetchLabels(): Promise<UiLabel[]> {
  const { data } = await supabase.from("ui_labels").select("*").order("sort_order", { ascending: true });
  const rows = (data as UiLabel[] | null) ?? [];
  writeCachedLabels(rows);
  return rows;
}

export function useLabels() {
  return useQuery({
    queryKey: labelsKey,
    queryFn: fetchLabels,
    staleTime: 60_000,
    // Đọc nhãn đã lưu từ lần tải trước (localStorage) làm dữ liệu ban đầu — để lần render ĐẦU TIÊN sau
    // khi reload trang đã hiển thị đúng nhãn đã tùy chỉnh (vd: "Hoạt động trung tâm") thay vì chữ mặc
    // định ("Đăng nhập") rồi mới đổi lại khi fetch xong. Dữ liệu thật vẫn được refetch ngầm phía sau.
    initialData: readCachedLabels,
  });
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
