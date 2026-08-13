import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { APP_FONTS, labelsKey, useLabels, type UiLabel } from "@/lib/labels";

export function LabelsCard() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useLabels();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rows) setDraft(Object.fromEntries(rows.map((r) => [r.key, r.value || r.default_value])));
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, UiLabel[]>();
    for (const r of rows ?? []) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return [...map.entries()];
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rows ?? []) {
        const next = (draft[r.key] ?? "").trim() || r.default_value;
        if (next === r.value) continue;
        const { error } = await supabase.from("ui_labels").update({ value: next }).eq("key", r.key);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Đã lưu tên gọi hiển thị");
      qc.invalidateQueries({ queryKey: labelsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Type className="h-4 w-4" /> Tên gọi hiển thị</CardTitle>
        <CardDescription>Đổi nhãn của tên app, tab điều hướng, nút chính và trang đăng nhập.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <div className="text-sm text-muted-foreground">Đang tải…</div>}
        {groups.map(([cat, items]) => (
          <div key={cat} className="space-y-3">
            <div className="text-sm font-semibold">{cat}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <div key={r.key} className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">{r.label}</Label>
                  {r.key === "app.font" ? (
                    <Select
                      value={draft[r.key] || r.default_value}
                      onValueChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {APP_FONTS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            <span style={{ fontFamily: `"${f.value}", var(--font-sans)` }}>{f.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input
                        value={draft[r.key] ?? ""}
                        maxLength={r.max_len}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                        placeholder={r.default_value}
                      />
                      <div className="text-[10px] text-muted-foreground">
                        Tối đa {r.max_len} ký tự · mặc định: {r.default_value}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lưu tên gọi
          </Button>
          <Button
            variant="outline"
            onClick={() => setDraft(Object.fromEntries((rows ?? []).map((r) => [r.key, r.default_value])))}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Về mặc định
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
