import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const Attachment = z.object({
  kind: z.enum(["image", "video", "link"]),
  url: z.string().min(1).max(2000),
  label: z.string().max(200).nullable().optional(),
});

const STORAGE_MARKER = "/object/sign/learning-media/";
function extractStoragePaths(attachments: { kind: string; url: string }[] | null | undefined): string[] {
  const paths: string[] = [];
  for (const a of attachments ?? []) {
    if (a?.kind !== "image" || typeof a.url !== "string") continue;
    const idx = a.url.indexOf(STORAGE_MARKER);
    if (idx === -1) continue;
    const rest = a.url.slice(idx + STORAGE_MARKER.length);
    const path = rest.split("?")[0];
    if (path) paths.push(decodeURIComponent(path));
  }
  return paths;
}

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
    let removedPaths: string[] = [];
    if (data.id) {
      const { data: prev } = await (sb as any).from("learning_logs").select("attachments").eq("id", data.id).maybeSingle();
      const oldPaths = new Set(extractStoragePaths(prev?.attachments));
      const newPaths = new Set(extractStoragePaths(data.attachments));
      removedPaths = [...oldPaths].filter((p) => !newPaths.has(p));
      const { error } = await (sb as any).from("learning_logs").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (sb as any).from("learning_logs").insert(payload);
      if (error) throw new Error(error.message);
    }
    if (removedPaths.length) {
      await (sb as any).storage.from("learning-media").remove(removedPaths);
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
    const { data: row } = await (sb as any).from("learning_logs").select("attachments").eq("id", data.id).maybeSingle();
    const { error } = await (sb as any).from("learning_logs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const paths = extractStoragePaths(row?.attachments);
    if (paths.length) await (sb as any).storage.from("learning-media").remove(paths);
    return { ok: true };
  });

export const cleanupOrphanedLearningMedia = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data: userData } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    const { data: ownerRow } = await (sb as any).from("center_owner").select("user_id").eq("id", 1).maybeSingle();
    if (!uid || ownerRow?.user_id !== uid) {
      throw new Error("Chỉ Chủ trung tâm mới có quyền dọn dẹp ảnh.");
    }

    const { data: logs, error: logsErr } = await (sb as any).from("learning_logs").select("attachments");
    if (logsErr) throw new Error(logsErr.message);
    const inUse = new Set<string>();
    for (const row of logs ?? []) {
      for (const p of extractStoragePaths(row.attachments)) inUse.add(p);
    }

    const { data: folders, error: foldersErr } = await (sb as any).storage.from("learning-media").list("", { limit: 1000 });
    if (foldersErr) throw new Error(foldersErr.message);

    const toDelete: string[] = [];
    for (const folder of folders ?? []) {
      if (!folder?.name || folder.id !== null) continue; // only recurse into pseudo-folders (id === null)
      const { data: files } = await (sb as any).storage.from("learning-media").list(folder.name, { limit: 1000 });
      for (const f of files ?? []) {
        if (!f?.name || f.id === null) continue; // skip nested folders, just in case
        const path = `${folder.name}/${f.name}`;
        if (!inUse.has(path)) toDelete.push(path);
      }
    }

    if (toDelete.length > 0) {
      const { error: rmErr } = await (sb as any).storage.from("learning-media").remove(toDelete);
      if (rmErr) throw new Error(rmErr.message);
    }
    return { deleted: toDelete.length };
  });
