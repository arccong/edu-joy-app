CREATE POLICY "branding_read_all" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'branding');
CREATE POLICY "branding_owner_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding' AND public.is_owner());
CREATE POLICY "branding_owner_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding' AND public.is_owner()) WITH CHECK (bucket_id = 'branding' AND public.is_owner());
CREATE POLICY "branding_owner_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding' AND public.is_owner());