import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Sai định dạng HH:MM");

export const listTrialStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data, error } = await (sb as any)
      .from("trial_students")
      .select("*")
      .order("trial_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const TrialInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    age: z.number().int().min(1).max(120),
    class_type: ClassType,
    start_time: TimeStr,
    end_time: TimeStr,
    trial_date: z.string(),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "Giờ bắt đầu phải trước giờ kết thúc",
    path: ["end_time"],
  });

export const upsertTrialStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrialInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data, name: data.name.trim() };
    if (data.id) {
      const { error } = await (sb as any).from("trial_students").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { id: _ignore, ...insert } = payload;
    const { data: row, error } = await (sb as any)
      .from("trial_students")
      .insert({ ...insert, status: "Học thử" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id as string };
  });

export const deleteTrialStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error } = await (sb as any).from("trial_students").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const TrialAttendance = z.object({
  id: z.string().uuid(),
  status: z.enum(["Đi học", "Nghỉ có phép", "Nghỉ không phép"]),
  note: z.string().trim().max(500).nullable().optional(),
  makeup_date: z.string().nullable().optional(),
});

/**
 * Điểm danh buổi học thử (1 buổi duy nhất).
 * - Đi học / Nghỉ không phép: ghi nhận kết quả, buổi học thử khép lại.
 * - Nghỉ có phép: bắt buộc có lý do + ngày học thử bù → dời ngày trên cùng hồ sơ,
 *   lưu lịch sử dời buổi và đặt lại trạng thái điểm danh cho buổi mới.
 */
export const setTrialAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrialAttendance.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error: e0 } = await sb
      .from("trial_students")
      .select("id, trial_date, reschedule_history")
      .eq("id", data.id)
      .single();
    if (e0) throw new Error(e0.message);
    if (!row) throw new Error("Không tìm thấy học sinh học thử");

    if (data.status === "Nghỉ có phép") {
      const reason = (data.note ?? "").trim();
      if (!reason) throw new Error("Vui lòng ghi rõ lý do nghỉ có phép");
      if (!data.makeup_date) throw new Error("Vui lòng chọn ngày học thử bù");
      if (data.makeup_date <= row.trial_date) throw new Error("Ngày học thử bù phải sau ngày đã nghỉ");
      const history = Array.isArray(row.reschedule_history) ? row.reschedule_history : [];
      const { error } = await sb
        .from("trial_students")
        .update({
          trial_date: data.makeup_date,
          status: "Học thử",
          attendance_status: null,
          attendance_note: null,
          attendance_marked_at: null,
          reschedule_history: [
            ...history,
            { from_date: row.trial_date, to_date: data.makeup_date, reason, at: new Date().toISOString() },
          ],
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, rescheduled_to: data.makeup_date };
    }

    const { error } = await sb
      .from("trial_students")
      .update({
        attendance_status: data.status,
        attendance_note: null,
        attendance_marked_at: new Date().toISOString(),
        status: "Kết thúc",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
