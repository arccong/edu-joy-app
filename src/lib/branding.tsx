import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BrandColors = Record<string, string>;

export const COLOR_TOKENS = [
  { key: "primary", label: "Màu chính" },
  { key: "primary-foreground", label: "Chữ trên màu chính" },
  { key: "secondary", label: "Màu phụ" },
  { key: "secondary-foreground", label: "Chữ trên màu phụ" },
  { key: "accent", label: "Màu nhấn" },
  { key: "accent-foreground", label: "Chữ trên màu nhấn" },
  { key: "background", label: "Màu nền" },
  { key: "foreground", label: "Màu chữ" },
  { key: "card", label: "Nền thẻ" },
  { key: "card-foreground", label: "Chữ trên thẻ" },
  { key: "form-background", label: "Nền bảng nhập liệu" },
  { key: "muted", label: "Nền mờ" },
  { key: "muted-foreground", label: "Chữ mờ" },
  { key: "border", label: "Đường viền" },
  { key: "input", label: "Viền ô nhập" },
  { key: "ring", label: "Viền chọn" },
  { key: "trial", label: "Tên học sinh học thử (Thời khóa biểu)" },
] as const;

export type BrandSettings = {
  id: number;
  logo_url: string | null;
  app_name: string | null;
  colors: BrandColors;
  preset_id: string | null;
  hide_login_title: boolean;
};

export type ThemePreset = {
  id: string;
  name: string;
  colors: BrandColors;
  kind: "system" | "custom";
  sort_order: number;
};

export const brandKey = ["brand-settings"] as const;
export const presetsKey = ["theme-presets"] as const;

export async function fetchBrand(): Promise<BrandSettings | null> {
  const { data } = await supabase.from("brand_settings").select("*").eq("id", 1).maybeSingle();
  return (data as BrandSettings | null) ?? null;
}

export async function fetchPresets(): Promise<ThemePreset[]> {
  const { data } = await supabase
    .from("theme_presets")
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as ThemePreset[] | null) ?? [];
}

export function useBrand() {
  return useQuery({ queryKey: brandKey, queryFn: fetchBrand, staleTime: 60_000 });
}

export function usePresets() {
  return useQuery({ queryKey: presetsKey, queryFn: fetchPresets, staleTime: 60_000 });
}

/** Applies color tokens on :root. Passing null/{} restores the default theme. */
export function applyBrandColors(colors: BrandColors | null | undefined) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const { key } of COLOR_TOKENS) {
    const v = colors?.[key];
    if (v) root.style.setProperty(`--${key}`, v);
    else root.style.removeProperty(`--${key}`);
  }
}

/** Mount once (root) so every page — including /auth — uses the saved branding. */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data } = useBrand();
  useEffect(() => {
    applyBrandColors(data?.colors);
  }, [data?.colors]);
  return <>{children}</>;
}

export function BrandLogo({ className, fallback }: { className?: string; fallback?: React.ReactNode }) {
  const { data } = useBrand();
  const src = data?.logo_url || "/logo-full.svg";
  if (src) {
    return <img src={src} alt={data?.app_name || "Logo"} className={className} />;
  }
  return <>{fallback}</>;
}
