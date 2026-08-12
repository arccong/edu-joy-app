-- helper: person is accessible to current user
create or replace function public.can_access_person(_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_manager()
     or not exists (select 1 from public.students s where s.person_id = _person_id)
     or exists (
       select 1 from public.students s
       where s.person_id = _person_id and public.teaches(s.class_type)
     )
$$;

drop policy if exists class_schedule_select on public.class_schedule;
create policy class_schedule_select on public.class_schedule
for select to authenticated
using (public.is_manager() or public.teaches(class_type));

drop policy if exists people_select on public.people;
create policy people_select on public.people
for select to authenticated
using (public.can_access_person(id));

drop policy if exists people_update on public.people;
create policy people_update on public.people
for update to authenticated
using (public.can_access_person(id))
with check (public.can_access_person(id));