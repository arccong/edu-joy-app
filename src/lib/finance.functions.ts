import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function normalizeMonth(m: string) {
  if (/^\d{4}-\d{2}$/.test(m)) return m + "-01";
  return m.slice(0, 7) + "-01";
}

function addMonths(monthISO: string, n: number) {
  const [y, m] = monthISO.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonthISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Đảm bảo mỗi "khoản chi cố định hàng tháng" đang active đều đã có đủ dòng finance_entries tới hết
 * THÁNG HIỆN TẠI (không sinh trước cho các tháng tương lai xa) — chạy mỗi khi danh sách tài chính được
 * tải, nên người dùng không cần làm gì thêm: cứ mở app vào tháng mới là khoản cố định tự xuất hiện.
 * Dùng last_materialized_month (không dùng "quét xem tháng đó đã có dòng chưa") để nếu người dùng xóa
 * 1 dòng cụ thể trong chuỗi, hệ thống sẽ không tự tạo lại dòng đã xóa đó ở lần tải sau.
 */
async function materializeRecurringExpenses(sb: any) {
  const { data: series, error } = await sb.from("recurring_expenses").select("*").eq("active", true);
  if (error || !series || series.length === 0) return;
  const untilMonth = currentMonthISO();
  for (const s of series as any[]) {
    let cursor = addMonths(s.last_materialized_month, 1);
    const toInsert: any[] = [];
    let guard = 0;
    while (cursor <= untilMonth && guard < 240) {
      toInsert.push({
        month: cursor,
        kind: "chi",
        category: s.category,
        amount: Number(s.unit_amount) * Number(s.quantity || 1),
        unit_amount: s.unit_amount,
        quantity: s.quantity ?? 1,
        note: s.note,
        is_fixed: true,
        class_type: s.class_type,
        recurring_expense_id: s.id,
      });
      cursor = addMonths(cursor, 1);
      guard++;
    }
    if (toInsert.length > 0) {
      const { error: eIns } = await sb.from("finance_entries").insert(toInsert);
      if (!eIns) {
        const lastMonth = toInsert[toInsert.length - 1].month;
        await sb.from("recurring_expenses").update({ last_materialized_month: lastMonth }).eq("id", s.id);
      }
    }
  }
}

export const listExpenseCategories = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase;
  const { data, error } = await (sb as any).from("expense_categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFinanceEntries = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase;
  await materializeRecurringExpenses(sb);
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
  quantity: z.number().int().min(1).default(1),
  unit_amount: z.number().min(0).default(0),

  class_type: z.string().max(20).nullable().optional(),
  income_type: z.enum(["hoc_phi", "khac"]).nullable().optional(),
  student_name: z.string().max(120).nullable().optional(),
  course_label: z.string().max(30).nullable().optional(),
  term_start: z.string().nullable().optional(),
  term_end: z.string().nullable().optional(),
  paid_date: z.string().nullable().optional(),
  teacher_id: z.string().uuid().nullable().optional(),
});

export const upsertFinanceEntry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EntryInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const month = normalizeMonth(data.month);
    const wantsFixed = data.kind === "chi" && data.is_fixed;

    let existing: any = null;
    if (data.id) {
      const { data: row, error: eFetch } = await (sb as any)
        .from("finance_entries")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (eFetch) throw new Error(eFetch.message);
      existing = row;
    }

    let recurringId: string | null = existing?.recurring_expense_id ?? null;

    if (wantsFixed && !recurringId) {
      // Bật "khoản cố định hàng tháng" (khoản mới, hoặc khoản cũ vừa tick lên) -> mở 1 chuỗi cố định
      // mới, tính từ THÁNG NÀY. Từ tháng sau, hệ thống tự thêm dòng mà không cần nhập lại.
      const { data: seriesRow, error: eSeries } = await (sb as any)
        .from("recurring_expenses")
        .insert({
          category: data.category,
          class_type: data.class_type ?? null,
          unit_amount: data.unit_amount,
          quantity: data.quantity,
          note: data.note ?? null,
          start_month: month,
          last_materialized_month: month,
          active: true,
        })
        .select()
        .single();
      if (eSeries) throw new Error(eSeries.message);
      recurringId = seriesRow.id;
    } else if (!wantsFixed && recurringId) {
      // Bỏ tick "cố định" cho 1 khoản đang thuộc chuỗi -> ngừng chuỗi từ đây trở đi (không tự thêm
      // tháng mới nữa). Các dòng những tháng ĐÃ được tạo trước đó vẫn giữ nguyên, không tự xóa.
      await (sb as any).from("recurring_expenses").update({ active: false }).eq("id", recurringId);
      recurringId = null;
    } else if (wantsFixed && recurringId) {
      // Vẫn thuộc chuỗi cố định -> cập nhật MẪU để các tháng SAU (chưa tồn tại) dùng giá trị mới, đồng
      // thời áp giá trị mới cho các dòng ĐÃ TỒN TẠI có tháng SAU tháng đang sửa (tháng đang sửa được cập
      // nhật ở bước upsert bên dưới, tháng trước đó giữ nguyên — không hồi tố về quá khứ).
      await (sb as any)
        .from("recurring_expenses")
        .update({
          category: data.category,
          class_type: data.class_type ?? null,
          unit_amount: data.unit_amount,
          quantity: data.quantity,
          note: data.note ?? null,
        })
        .eq("id", recurringId);

      const { error: eCascade } = await (sb as any)
        .from("finance_entries")
        .update({
          category: data.category,
          class_type: data.class_type ?? null,
          unit_amount: data.unit_amount,
          quantity: data.quantity,
          amount: Number(data.unit_amount) * Number(data.quantity),
          note: data.note ?? null,
        })
        .eq("recurring_expense_id", recurringId)
        .gt("month", month);
      if (eCascade) throw new Error(eCascade.message);
    }

    const payload = {
      ...data,
      month,
      note: data.note ?? null,
      class_type: data.class_type ?? null,
      income_type: data.income_type ?? null,
      student_name: data.student_name ?? null,
      course_label: data.course_label ?? null,
      term_start: data.term_start || null,
      term_end: data.term_end || null,
      paid_date: data.paid_date || null,
      teacher_id: data.teacher_id || null,
      recurring_expense_id: recurringId,
    };

    if (data.id) {
      const { id: _i, ...upd } = payload;
      const { error } = await (sb as any).from("finance_entries").update(upd).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _i, ...ins } = payload;
      const { error } = await (sb as any).from("finance_entries").insert(ins);
      if (error) throw new Error(error.message);
    }

    if (recurringId) {
      // Nếu khoản này đang thuộc chuỗi cố định, tranh thủ sinh nốt các tháng còn thiếu tới tháng hiện
      // tại luôn (phòng trường hợp đang sửa 1 chuỗi cũ mà vài tháng gần đây chưa kịp tự sinh).
      await materializeRecurringExpenses(sb);
    }

    return { ok: true };
  });

export const deleteFinanceEntry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error } = await (sb as any).from("finance_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
