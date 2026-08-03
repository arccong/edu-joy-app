import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function normalizeMonth(m: string) {
  if (/^\d{4}-\d{2}$/.test(m)) return m + "-01";
  return m.slice(0, 7) + "-01";
}

export const listExpenseCategories = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any).from("expense_categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFinanceEntries = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any)
    .from("finance_entries")
    .select("*")
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const EntryInput = z.object({
  id: z.string().uuid().optional(),
  month: z.string(),
  kind: z.enum(["thu", "chi"]),
  category: z.string().trim().min(1).max(200),
  amount: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
  is_fixed: z.boolean().default(false),
});

export const upsertFinanceEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => EntryInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const payload = { ...data, month: normalizeMonth(data.month), note: data.note ?? null };
    if (data.id) {
      const { error } = await (sb as any).from("finance_entries").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _i, ...ins } = payload;
      const { error } = await (sb as any).from("finance_entries").insert(ins);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteFinanceEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await (sb as any).from("finance_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
