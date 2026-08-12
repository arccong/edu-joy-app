CREATE OR REPLACE FUNCTION public.change_user_role(_user_id uuid, _role app_role, _classes class_type[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Chỉ Chủ trung tâm mới được đổi vai trò tài khoản.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.center_owner WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'Không thể đổi vai trò của tài khoản Chủ trung tâm.';
  END IF;
  IF _role = 'giao_vien' AND (_classes IS NULL OR array_length(_classes, 1) IS NULL) THEN
    RAISE EXCEPTION 'Vui lòng chọn ít nhất một lớp phụ trách cho Giáo viên.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);

  DELETE FROM public.teacher_classes WHERE user_id = _user_id;
  IF _role = 'giao_vien' THEN
    INSERT INTO public.teacher_classes (user_id, class_type)
    SELECT _user_id, c FROM unnest(_classes) AS c;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.change_user_role(uuid, app_role, class_type[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, app_role, class_type[]) TO authenticated, service_role;