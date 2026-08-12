import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ImageUp, Loader2, Palette, RotateCcw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  COLOR_TOKENS,
  applyBrandColors,
  brandKey,
  presetsKey,
  useBrand,
  usePresets,
  type BrandColors,
} from "@/lib/branding";

function PresetSwatches({ colors }: { colors: BrandColors }) {
  const keys = ["primary", "secondary", "accent", "background", "foreground"];
  return (
    <div className="flex gap-1">
      {keys.map((k) => (
        <span key={k} className="h-5 w-5 rounded-full border" style={{ background: colors[k] || "transparent" }} />
      ))}
    </div>
  );
}

export function BrandingCard() {
  const qc = useQueryClient();
  const { data: brand } = useBrand();
  const { data: presets } = usePresets();

  const [colors, setColors] = useState<BrandColors>({});
  const [presetId, setPresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (brand && !loaded.current) {
      loaded.current = true;
      setColors(brand.colors ?? {});
      setPresetId(brand.preset_id ?? null);
    }
  }, [brand]);

  // Live preview while editing
  useEffect(() => {
    applyBrandColors(colors);
  }, [colors]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: brandKey });
    qc.invalidateQueries({ queryKey: presetsKey });
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("brand_settings")
        .update({ colors: colors as never, preset_id: presetId })
        .eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Đã lưu giao diện"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePreset = useMutation({
    mutationFn: async () => {
      const name = newPresetName.trim();
      if (!name) throw new Error("Nhập tên gói màu");
      const { error } = await supabase
        .from("theme_presets")
        .insert({ name, colors: colors as never, kind: "custom" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Đã lưu gói màu mới"); setNewPresetName(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("theme_presets").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Đã xóa gói màu"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPickLogo(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("branding").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw new Error(up.error.message);
      const signed = await supabase.storage.from("branding").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed.error) throw new Error(signed.error.message);
      const { error } = await supabase.from("brand_settings").update({ logo_url: signed.data.signedUrl }).eq("id", 1);
      if (error) throw new Error(error.message);
      toast.success("Đã cập nhật logo");
      qc.invalidateQueries({ queryKey: brandKey });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const removeLogo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("brand_settings").update({ logo_url: null }).eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Đã gỡ logo"); qc.invalidateQueries({ queryKey: brandKey }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(() => presets ?? [], [presets]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Thương hiệu & Giao diện</CardTitle>
        <CardDescription>Logo và bộ màu áp dụng cho toàn bộ ứng dụng, kể cả trang Đăng nhập.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {brand?.logo_url
                ? <img src={brand.logo_url} alt="Logo hiện tại" className="h-full w-full object-contain" />
                : <span className="text-xs text-muted-foreground">Chưa có</span>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickLogo(f); e.target.value = ""; }}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}
              Tải logo lên
            </Button>
            {brand?.logo_url && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeLogo.mutate()}>
                <Trash2 className="mr-2 h-4 w-4" /> Gỡ logo
              </Button>
            )}
          </div>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label>Gói màu</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setColors(p.colors ?? {}); setPresetId(p.id); }}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${presetId === p.id ? "border-primary ring-1 ring-primary" : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    {p.name}
                    {presetId === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <PresetSwatches colors={p.colors ?? {}} />
                    <Badge variant={p.kind === "system" ? "secondary" : "outline"} className="text-[10px]">
                      {p.kind === "system" ? "Mặc định" : "Tự tạo"}
                    </Badge>
                  </span>
                </span>
                {p.kind === "custom" && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); delPreset.mutate(p.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); delPreset.mutate(p.id); } }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Individual colors */}
        <div className="space-y-2">
          <Label>Tùy chỉnh từng màu</Label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_TOKENS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(colors[key] || "") ? colors[key] : "#ffffff"}
                  onChange={(e) => { setColors((c) => ({ ...c, [key]: e.target.value })); setPresetId(null); }}
                  className="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                  aria-label={label}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-muted-foreground">{label}</div>
                  <div className="truncate text-xs font-mono">{colors[key] || "mặc định"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save preset */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[200px] flex-1 gap-1">
            <Label>Lưu tổ hợp màu hiện tại thành gói mới</Label>
            <Input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Tên gói màu" />
          </div>
          <Button variant="outline" onClick={() => savePreset.mutate()} disabled={savePreset.isPending}>
            <Save className="mr-2 h-4 w-4" /> Lưu thành gói mới
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu áp dụng toàn app
          </Button>
          <Button
            variant="outline"
            onClick={() => { setColors({}); setPresetId(null); }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Về giao diện mặc định
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
