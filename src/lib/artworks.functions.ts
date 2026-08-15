import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);

export const listArtworks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await (context.supabase as any)
    .from("artworks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const createArtwork = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      class_type: ClassType,
      title: z.string().trim().min(1).max(300),
      cover_image_url: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("artworks")
      .insert({ ...data, cover_image_url: data.cover_image_url ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateArtworkCover = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), cover_image_url: z.string().max(2000).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("artworks")
      .update({ cover_image_url: data.cover_image_url })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
