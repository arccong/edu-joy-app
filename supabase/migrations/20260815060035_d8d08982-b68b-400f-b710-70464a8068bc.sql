CREATE TABLE public.artworks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_type class_type not null,
  title text not null,
  cover_image_url text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artworks TO authenticated;
GRANT ALL ON public.artworks TO service_role;
ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY artworks_select ON public.artworks FOR SELECT TO authenticated USING (public.is_manager() OR public.teaches(class_type));
CREATE POLICY artworks_insert ON public.artworks FOR INSERT TO authenticated WITH CHECK (public.is_manager() OR public.teaches(class_type));
CREATE POLICY artworks_update ON public.artworks FOR UPDATE TO authenticated USING (public.is_manager() OR public.teaches(class_type)) WITH CHECK (public.is_manager() OR public.teaches(class_type));
CREATE POLICY artworks_delete ON public.artworks FOR DELETE TO authenticated USING (public.is_manager());

ALTER TABLE public.learning_logs
  ADD COLUMN artwork_id uuid REFERENCES public.artworks(id) ON DELETE SET NULL,
  ADD COLUMN is_published boolean NOT NULL DEFAULT false;