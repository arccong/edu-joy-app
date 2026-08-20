import { useEffect, useLayoutEffect, useState } from "react";
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

// useLayoutEffect báo lỗi console khi chạy trên server (SSR không có gì để "đo trước khi vẽ" cả) —
// dùng useEffect thường ở server, useLayoutEffect (chạy sớm hơn, trước khi trình duyệt vẽ) ở client.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  // KHÔNG dùng initialData đọc localStorage ở đây — app này chạy SSR (TanStack Start), và trên server
  // không có localStorage. Nếu initialData trả về khác nhau giữa server (không có cache) và client (có
  // cache), React sẽ bị lệch hydration (nội dung client tính ra khác với HTML server đã gửi), gây lỗi
  // và không thực sự sửa được hiện tượng nháy chữ. Xem useLabel() bên dưới để biết cách áp cache đúng.
  return useQuery({ queryKey: labelsKey, queryFn: fetchLabels, staleTime: 60_000 });
}

/**
 * Trả về hàm t(key) đọc nhãn (có fallback). Ưu tiên: dữ liệu THẬT đã fetch xong > nhãn cache từ lần
 * trước (localStorage) > giá trị mặc định cứng (LABEL_FALLBACKS).
 *
 * Nhãn cache được áp bằng useLayoutEffect — luôn bắt đầu ở trạng thái "chưa có" (undefined) giống hệt
 * lúc server render (không lỗi hydration mismatch), rồi cập nhật NGAY lập tức ngay sau khi trang được
 * gắn vào DOM ở client — TRƯỚC khi trình duyệt kịp vẽ khung hình kế tiếp — nên gần như không thấy nháy
 * chữ (khác với cách chờ query fetch xong, vốn phải đợi cả một lượt gọi mạng tới Supabase).
 */
export function useLabel() {
  const { data } = useLabels();
  const [cached, setCached] = useState<UiLabel[] | undefined>(undefined);
  useIsomorphicLayoutEffect(() => {
    setCached(readCachedLabels());
  }, []);
  const rows = data ?? cached;
  return (key: string) => {
    const row = rows?.find((l) => l.key === key);
    const v = (row?.value || "").trim();
    return v || row?.default_value || LABEL_FALLBACKS[key] || key;
  };
}
