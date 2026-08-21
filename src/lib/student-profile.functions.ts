import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RELATIONSHIPS = ["Bố", "Mẹ", "Ông nội", "Bà nội", "Ông ngoại", "Bà ngoại", "Khác"] as const;

export type GuardianRelationship = (typeof RELATIONSHIPS)[number];

export interface PersonProfile {
  id: string;
  name: string;
  age: number;
  birth_date: string | null;
  gender: "Nam" | "Nữ" | null;
  student_code: string;
  note: string | null;
}

export interface Guardian {
  id: string;
  name: string;
  relationship: GuardianRelationship;
  phone: string | null;
  email: string | null;
  note: string | null;
  portal_enabled: boolean;
}

export interface GuardianLink {
  id: string;
  person_id: string;
  guardian_id: string;
  is_primary: boolean;
  guardian: Guardian;
}

/** Toàn bộ hồ sơ "người" (people) — dùng cho danh sách + thông tin cố định trên trang Hồ sơ học sinh. */
export const listPeopleProfiles = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase as any;
  const { data, error } = await sb.from("people").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const UpdatePersonProfileInput = z.object({
  person_id: z.string().uuid(),
  birth_date: z.string().nullable().optional(),
  gender: z.enum(["Nam", "Nữ"]).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/** Sửa thông tin cố định (ngày sinh/giới tính/ghi chú) — KHÔNG cho sửa student_code (tự sinh ở DB). */
export const updatePersonProfile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePersonProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("people")
      .update({ birth_date: data.birth_date ?? null, gender: data.gender ?? null, note: data.note ?? null })
      .eq("id", data.person_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Toàn bộ liên kết học sinh-phụ huynh kèm thông tin phụ huynh (embed), dùng để nhóm theo person_id ở client. */
export const listGuardianLinks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase as any;
  const { data, error } = await sb
    .from("student_guardians")
    .select("id, person_id, guardian_id, is_primary, created_at, guardian:guardians(*)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const GuardianInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  relationship: z.enum(RELATIONSHIPS),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * Tạo/sửa 1 phụ huynh. Nếu không có `id` (tạo mới) và có kèm `person_id`, sẽ tự động nối luôn phụ huynh
 * đó vào học sinh (tạo dòng student_guardians tương ứng) trong cùng 1 lần gọi cho tiện — người dùng
 * không phải làm 2 bước (tạo phụ huynh rồi mới đi nối riêng).
 */
export const upsertGuardian = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GuardianInput.extend({ person_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const payload = {
      name: data.name.trim(),
      relationship: data.relationship,
      phone: data.phone || null,
      email: data.email || null,
      note: data.note || null,
    };
    if (data.id) {
      const { error } = await sb.from("guardians").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await sb.from("guardians").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    const guardianId = created.id as string;
    if (data.person_id) {
      const { error: eLink } = await sb.from("student_guardians").insert({ person_id: data.person_id, guardian_id: guardianId });
      if (eLink) throw new Error(eLink.message);
    }
    return { ok: true, id: guardianId };
  });

export const deleteGuardian = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    // ON DELETE CASCADE trên student_guardians tự dọn các liên kết liên quan.
    const { error } = await sb.from("guardians").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Nối 1 phụ huynh CÓ SẴN vào 1 học sinh khác (vd anh chị em ruột dùng chung phụ huynh). */
export const linkGuardian = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ person_id: z.string().uuid(), guardian_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("student_guardians").insert({ person_id: data.person_id, guardian_id: data.guardian_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkGuardian = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ link_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("student_guardians").delete().eq("id", data.link_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Đặt 1 phụ huynh làm đầu mối liên hệ chính của 1 học sinh — chỉ 1 người chính tại 1 thời điểm. */
export const setPrimaryGuardian = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ person_id: z.string().uuid(), link_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error: e1 } = await sb.from("student_guardians").update({ is_primary: false }).eq("person_id", data.person_id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb.from("student_guardians").update({ is_primary: true }).eq("id", data.link_id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
