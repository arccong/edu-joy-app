import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function assertManager(sb: any) {
  const { data, error } = await sb.rpc("is_manager");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bạn không có quyền thực hiện thao tác này");
}

export interface TeacherProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  birth_date: string | null;
  gender: "Nam" | "Nữ" | null;
  address: string | null;
  avatar_url: string | null;
  teacher_code: string | null;
}

/** Toàn bộ tài khoản có vai trò Giáo viên, kèm lớp phụ trách (teacher_classes). */
export const listTeachers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertManager(context.supabase);
  const sb = await admin();
  const [{ data: profiles, error: e1 }, { data: roles, error: e2 }, { data: classes, error: e3 }] = await Promise.all([
    sb.from("profiles").select("*").order("created_at", { ascending: true }),
    sb.from("user_roles").select("user_id, role"),
    sb.from("teacher_classes").select("user_id, class_type"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  const teacherIds = new Set((roles ?? []).filter((r: any) => r.role === "giao_vien").map((r: any) => r.user_id));
  return (profiles ?? [])
    .filter((p: any) => teacherIds.has(p.id))
    .map((p: any) => ({
      ...p,
      classes: (classes ?? []).filter((c: any) => c.user_id === p.id).map((c: any) => c.class_type),
    }));
});

/** Sinh mã giáo viên "LA-Gxxxxx" nếu chưa có (khởi tạo lần đầu mở hồ sơ) — atomic qua sequence ở DB. */
export const ensureTeacherCode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teacher_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    const { data: row, error } = await sb.from("profiles").select("id, teacher_code").eq("id", data.teacher_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Không tìm thấy giáo viên");
    if (row.teacher_code) return { teacher_code: row.teacher_code as string };
    const { data: code, error: eCode } = await sb.rpc("next_teacher_code");
    if (eCode) throw new Error(eCode.message);
    const { error: eUpd } = await sb.from("profiles").update({ teacher_code: code }).eq("id", data.teacher_id);
    if (eUpd) throw new Error(eUpd.message);
    return { teacher_code: code as string };
  });

const UpdateTeacherProfileInput = z.object({
  teacher_id: z.string().uuid(),
  birth_date: z.string().nullable().optional(),
  gender: z.enum(["Nam", "Nữ"]).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
});

export const updateTeacherProfile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateTeacherProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    const { error } = await sb
      .from("profiles")
      .update({ birth_date: data.birth_date ?? null, gender: data.gender ?? null, address: data.address ?? null })
      .eq("id", data.teacher_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTeacherAvatar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teacher_id: z.string().uuid(), avatar_url: z.string().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase);
    const sb = await admin();
    const { error } = await sb.from("profiles").update({ avatar_url: data.avatar_url }).eq("id", data.teacher_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Toàn bộ liên kết ca dạy-giáo viên (dùng để tính "Ca dạy trong tuần" của từng giáo viên). */
export const listClassScheduleTeachers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase as any;
  const { data, error } = await sb.from("class_schedule_teachers").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const AssignSlotInput = z.object({
  class_type: z.enum(["Piano", "Múa", "Vẽ"]),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string(),
  end_time: z.string(),
  teacher_id: z.string().uuid(),
});

export const assignClassScheduleTeacher = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssignSlotInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("class_schedule_teachers").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignClassScheduleTeacher = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("class_schedule_teachers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Nghỉ phép */
export const listTeacherLeaves = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase as any;
  const { data, error } = await sb.from("teacher_leaves").select("*").order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const TeacherLeaveInput = z.object({
  id: z.string().uuid().optional(),
  teacher_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().max(500).nullable().optional(),
});

export const upsertTeacherLeave = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TeacherLeaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const payload = { teacher_id: data.teacher_id, start_date: data.start_date, end_date: data.end_date, reason: data.reason || null };
    if (data.id) {
      const { error } = await sb.from("teacher_leaves").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("teacher_leaves").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTeacherLeave = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("teacher_leaves").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lương thưởng */
export const listTeacherSalaryPayments = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase as any;
  const { data, error } = await sb.from("teacher_salary_payments").select("*").order("paid_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const TeacherSalaryInput = z.object({
  id: z.string().uuid().optional(),
  teacher_id: z.string().uuid(),
  amount: z.number().min(0),
  paid_date: z.string(),
  note: z.string().max(500).nullable().optional(),
});

export const upsertTeacherSalaryPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TeacherSalaryInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const payload = { teacher_id: data.teacher_id, amount: data.amount, paid_date: data.paid_date, note: data.note || null };
    if (data.id) {
      const { error } = await sb.from("teacher_salary_payments").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("teacher_salary_payments").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTeacherSalaryPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("teacher_salary_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
