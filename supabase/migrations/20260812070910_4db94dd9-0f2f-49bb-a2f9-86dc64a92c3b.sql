REVOKE EXECUTE ON FUNCTION public.is_owner() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;