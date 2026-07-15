import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const StudentStatus = z.enum(["Đang học", "Nghỉ phép", "Bảo lưu"]);
const AttendanceStatus = z.enum(["Đi học", "Nghỉ có phép", "Nghỉ không phép"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listStudents = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("students").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const StudentInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(1).max(120),
  class_type: ClassType,
  tuition: z.number().min(0),
  start_date: z.string(),
  end_date: z.string(),
  status: StudentStatus,
  reserve_days: z.number().int().min(0).default(0),
  total_sessions: z.number().int().min(1).max(500),
  schedule_days: z.array(z.number().int().min(0).max(6)).min(1),
  sessions_per_day: z.union([z.literal(1), z.literal(2)]),
}).refine((d) => d.schedule_days.length * d.sessions_per_day >= 2, {
  message: "Học sinh phải học tối thiểu 2 buổi/tuần",
  path: ["schedule_days"],
});

export const upsertStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StudentInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    if (data.id) {
      const { error } = await sb.from("students").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _ignore, ...insert } = data;
      const { error } = await sb.from("students").insert(insert);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("students").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("class_schedule").select("*").order("day_of_week").order("start_time");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb.from("attendance").select("*").eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      date: z.string(),
      status: AttendanceStatus,
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("attendance").upsert(data, { onConflict: "student_id,date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
