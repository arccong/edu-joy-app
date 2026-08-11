
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.teaches(public.class_type) from public, anon;
revoke all on function public.can_access_student(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_manager() to authenticated, service_role;
grant execute on function public.teaches(public.class_type) to authenticated, service_role;
grant execute on function public.can_access_student(uuid) to authenticated, service_role;
