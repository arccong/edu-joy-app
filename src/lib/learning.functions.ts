import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const Attachment = z.object({
  kind: z.enum(["image", "video", "link"]),
  url: z.string().min(1).max(2000),
  label: z.string().max(200).nullable().optional(),
});

export const listLearningLogs = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const sb = context.supabase;
  const { data, error } = await (sb as any)
    .from("learning_logs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const LogInput = z.object({
  id: z.string().uuid().optional(),
  student_id: z.string().uuid().nullable().optional(),
  class_type: ClassType,
  date: z.string(),
  title: z.string().trim().min(1).max(300),
  content: z.string().max(5000).nullable().optional(),
  attachments: z.array(Attachment).default([]),
  is_class_wide: z.boolean().default(false),
  artwork_id: z.string().uuid().nullable().optional(),
  is_published: z.boolean().default(false),
});

export const upsertLearningLog = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = {
      student_id: data.is_class_wide ? null : (data.student_id ?? null),
      class_type: data.class_type,
      date: data.date,
      title: data.title,
      content: data.content ?? null,
      attachments: data.attachments,
      is_class_wide: data.is_class_wide,
      artwork_id: data.artwork_id ?? null,
      is_published: data.is_published,
    };
    if (data.id) {
      const { error } = await (sb as any).from("learning_logs").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (sb as any).from("learning_logs").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setLogPublished = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_published: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("learning_logs")
      .update({ is_published: data.is_published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteLearningLog = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error } = await (sb as any).from("learning_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
