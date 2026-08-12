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
