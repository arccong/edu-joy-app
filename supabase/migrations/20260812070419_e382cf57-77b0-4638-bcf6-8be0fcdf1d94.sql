
CREATE TABLE public.center_owner (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.center_owner TO authenticated;
GRANT ALL ON public.center_owner TO service_role;

ALTER TABLE public.center_owner ENABLE ROW LEVEL SECURITY;

CREATE POLICY center_owner_select ON public.center_owner
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_updated_at_center_owner BEFORE UPDATE ON public.center_owner
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Never allow the single owner row to be deleted
CREATE OR REPLACE FUNCTION public.tg_block_owner_row_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Không thể xóa tài khoản Chủ trung tâm. Hãy chuyển giao quyền trước.';
END; $$;

CREATE TRIGGER center_owner_no_delete BEFORE DELETE ON public.center_owner
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_owner_row_delete();

-- Seed the current sole manager as the owner
INSERT INTO public.center_owner (id, user_id)
SELECT 1, 'dfdd207c-ff2b-4f63-88a4-376b77a165c6'::uuid
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.center_owner WHERE user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- Owner account itself can never be deleted
CREATE OR REPLACE FUNCTION public.tg_protect_owner_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  uid uuid;
BEGIN
  uid := CASE TG_TABLE_NAME WHEN 'profiles' THEN OLD.id ELSE OLD.user_id END;
  IF EXISTS (SELECT 1 FROM public.center_owner WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Không thể xóa tài khoản Chủ trung tâm.';
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER protect_owner_profile BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_owner_account();

CREATE TRIGGER protect_owner_role BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_owner_account();

-- Transfer ownership atomically
CREATE OR REPLACE FUNCTION public.transfer_ownership(_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur uuid;
BEGIN
  SELECT user_id INTO cur FROM public.center_owner WHERE id = 1;
  IF cur IS NULL THEN RAISE EXCEPTION 'Hệ thống chưa có Chủ trung tâm.'; END IF;
  IF cur = _new_owner THEN RAISE EXCEPTION 'Tài khoản này đã là Chủ trung tâm.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _new_owner AND role = 'quan_ly') THEN
    RAISE EXCEPTION 'Chỉ có thể chuyển giao cho tài khoản Quản lý.';
  END IF;
  UPDATE public.center_owner SET user_id = _new_owner WHERE id = 1;
END; $$;

REVOKE EXECUTE ON FUNCTION public.transfer_ownership(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid) TO service_role;
