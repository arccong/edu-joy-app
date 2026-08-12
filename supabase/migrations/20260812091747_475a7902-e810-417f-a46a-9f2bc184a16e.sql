CREATE TABLE public.brand_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_url text,
  app_name text,
  colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  preset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brand_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.brand_settings TO authenticated;
GRANT ALL ON public.brand_settings TO service_role;
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_settings_read ON public.brand_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY brand_settings_insert ON public.brand_settings FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY brand_settings_update ON public.brand_settings FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE TRIGGER set_updated_at_brand_settings BEFORE UPDATE ON public.brand_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.theme_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('system','custom')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.theme_presets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_presets TO authenticated;
GRANT ALL ON public.theme_presets TO service_role;
ALTER TABLE public.theme_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY theme_presets_read ON public.theme_presets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY theme_presets_insert ON public.theme_presets FOR INSERT TO authenticated WITH CHECK (public.is_owner() AND kind = 'custom');
CREATE POLICY theme_presets_update ON public.theme_presets FOR UPDATE TO authenticated USING (public.is_owner() AND kind = 'custom') WITH CHECK (public.is_owner() AND kind = 'custom');
CREATE POLICY theme_presets_delete ON public.theme_presets FOR DELETE TO authenticated USING (public.is_owner() AND kind = 'custom');
CREATE TRIGGER set_updated_at_theme_presets BEFORE UPDATE ON public.theme_presets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.brand_settings (id, colors) VALUES (1, '{}'::jsonb);

INSERT INTO public.theme_presets (name, kind, sort_order, colors) VALUES
('Mặc định (Tím)', 'system', 1, '{"primary":"#6949d4","primary-foreground":"#fcfcfd","secondary":"#f1f2f6","secondary-foreground":"#33374a","accent":"#e6e2fb","accent-foreground":"#3b3170","background":"#f8f9fb","foreground":"#20222e","card":"#ffffff","card-foreground":"#20222e","muted":"#f1f2f6","muted-foreground":"#71747f","border":"#e5e6ee","input":"#e5e6ee","ring":"#6949d4"}'::jsonb),
('Xanh biển', 'system', 2, '{"primary":"#0f7ac7","primary-foreground":"#ffffff","secondary":"#eef3f7","secondary-foreground":"#243547","accent":"#d9ecf9","accent-foreground":"#0d4a77","background":"#f7fafc","foreground":"#16222e","card":"#ffffff","card-foreground":"#16222e","muted":"#eef3f7","muted-foreground":"#64748b","border":"#e2e8f0","input":"#e2e8f0","ring":"#0f7ac7"}'::jsonb),
('Hồng nghệ thuật', 'system', 3, '{"primary":"#d6338b","primary-foreground":"#ffffff","secondary":"#fbeef5","secondary-foreground":"#4a2138","accent":"#fadcec","accent-foreground":"#8a1d59","background":"#fffafc","foreground":"#2b1a23","card":"#ffffff","card-foreground":"#2b1a23","muted":"#fbeef5","muted-foreground":"#86707c","border":"#f2e2ea","input":"#f2e2ea","ring":"#d6338b"}'::jsonb),
('Xanh lá dịu', 'system', 4, '{"primary":"#12855f","primary-foreground":"#ffffff","secondary":"#eef5f1","secondary-foreground":"#22372f","accent":"#d8efe4","accent-foreground":"#0d5740","background":"#f8fbf9","foreground":"#182420","card":"#ffffff","card-foreground":"#182420","muted":"#eef5f1","muted-foreground":"#6b7d75","border":"#e2ece7","input":"#e2ece7","ring":"#12855f"}'::jsonb);