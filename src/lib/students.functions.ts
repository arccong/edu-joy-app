import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const StudentStatus = z.enum(["Đang học", "Bảo lưu", "Hoàn thành", "Chuẩn bị"]);
const AttendanceStatus = z.enum(["Đi học", "Nghỉ có phép", "Nghỉ không phép", "Bảo lưu"]);

const TimeStr = z.string().regex(/^\d{2}:\d{2}$/, "Sai định dạng HH:MM");
const ScheduleSlot = z.object({
  day: z.number().int().min(0).max(6),
  start: TimeStr,
  end: TimeStr,
}).refine((s) => s.start < s.end, { message: "Giờ bắt đầu phải trước giờ kết thúc" });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listStudents = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any).from("students").select("*").order("created_at", { ascending: false });
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
  course_index: z.number().int().min(1).default(1),
  schedule_slots: z.array(ScheduleSlot).min(1),
}).refine((d) => {
  // Tối thiểu 2 buổi/tuần (1 giờ = 1 buổi)
  const total = d.schedule_slots.reduce((acc, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    return acc + Math.max(1, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60));
  }, 0);
  return total >= 2;
}, { message: "Học sinh phải học tối thiểu 2 buổi/tuần", path: ["schedule_slots"] })
  .refine((d) => {
  const dow = new Date(d.start_date + "T00:00:00").getDay();
  return d.schedule_slots.some((s) => s.day === dow);
}, { message: "Ngày bắt đầu không trùng lịch học", path: ["start_date"] })
  .refine((d) => {
    const dow = new Date(d.end_date + "T00:00:00").getDay();
    return d.schedule_slots.some((s) => s.day === dow);
  }, { message: "Ngày kết thúc không trùng lịch học", path: ["end_date"] });

function derive(slots: { day: number }[]) {
  const days = Array.from(new Set(slots.map((s) => s.day))).sort();
  const perDay = new Map<number, number>();
  for (const s of slots) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
  const maxPerDay = Math.max(...perDay.values(), 1);
  return { schedule_days: days, sessions_per_day: Math.min(maxPerDay, 2) };
}

export const upsertStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StudentInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { schedule_days, sessions_per_day } = derive(data.schedule_slots);
    const payload = { ...data, schedule_days, sessions_per_day };
    if (data.id) {
      const { error } = await (sb as any).from("students").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { id: _ignore, ...insert } = payload;
    const { data: row, error } = await (sb as any).from("students").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id as string };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await (sb as any).from("students").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any).from("class_schedule").select("*").order("day_of_week").order("start_time");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await (sb as any).from("attendance").select("*").eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAttendanceRange = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await (sb as any).from("attendance").select("*").gte("date", data.from).lte("date", data.to);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAttendanceByStudent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ student_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await (sb as any).from("attendance").select("*").eq("student_id", data.student_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      date: z.string(),
      status: AttendanceStatus,
      note: z.string().max(500).nullable().optional(),
      makeup_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const payload = {
      student_id: data.student_id,
      date: data.date,
      status: data.status,
      note: data.note ?? null,
      makeup_date: data.makeup_date ?? null,
    };
    const { error } = await (sb as any).from("attendance").upsert(payload, { onConflict: "student_id,date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ student_id: z.string().uuid(), date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await (sb as any).from("attendance").delete().eq("student_id", data.student_id).eq("date", data.date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

