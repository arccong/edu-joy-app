
-- 1. Roles
create type public.app_role as enum ('quan_ly','giao_vien');

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  class_type public.class_type not null,
  created_at timestamptz not null default now(),
  unique (user_id, class_type)
);
grant select on public.teacher_classes to authenticated;
grant all on public.teacher_classes to service_role;
alter table public.teacher_classes enable row level security;

create trigger set_updated_at_profiles before update on public.profiles
for each row execute function public.tg_set_updated_at();

-- 2. Helper functions
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'quan_ly')
$$;

create or replace function public.teaches(_class public.class_type)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teacher_classes where user_id = auth.uid() and class_type = _class)
$$;

create or replace function public.can_access_student(_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = _student_id and (public.is_manager() or public.teaches(s.class_type))
  )
$$;

-- 3. Policies for auth tables
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "user_roles_select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

create policy "teacher_classes_select" on public.teacher_classes for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- 4. Data tables
-- students
create policy "students_select" on public.students for select to authenticated
  using (public.is_manager() or public.teaches(class_type));
create policy "students_insert" on public.students for insert to authenticated
  with check (public.is_manager() or public.teaches(class_type));
create policy "students_update" on public.students for update to authenticated
  using (public.is_manager() or public.teaches(class_type))
  with check (public.is_manager() or public.teaches(class_type));
create policy "students_delete" on public.students for delete to authenticated
  using (public.is_manager());

-- people
create policy "people_select" on public.people for select to authenticated using (true);
create policy "people_insert" on public.people for insert to authenticated with check (true);
create policy "people_update" on public.people for update to authenticated using (true) with check (true);
create policy "people_delete" on public.people for delete to authenticated using (public.is_manager());

-- attendance
create policy "attendance_select" on public.attendance for select to authenticated
  using (public.can_access_student(student_id));
create policy "attendance_insert" on public.attendance for insert to authenticated
  with check (public.can_access_student(student_id));
create policy "attendance_update" on public.attendance for update to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));
create policy "attendance_delete" on public.attendance for delete to authenticated
  using (public.is_manager());

-- tuition_payments
create policy "tuition_select" on public.tuition_payments for select to authenticated
  using (public.can_access_student(student_id));
create policy "tuition_insert" on public.tuition_payments for insert to authenticated
  with check (public.can_access_student(student_id));
create policy "tuition_update" on public.tuition_payments for update to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));
create policy "tuition_delete" on public.tuition_payments for delete to authenticated
  using (public.is_manager());

-- schedule_changes
create policy "schedule_changes_select" on public.schedule_changes for select to authenticated
  using (public.can_access_student(student_id));
create policy "schedule_changes_insert" on public.schedule_changes for insert to authenticated
  with check (public.can_access_student(student_id));
create policy "schedule_changes_update" on public.schedule_changes for update to authenticated
  using (public.can_access_student(student_id))
  with check (public.can_access_student(student_id));
create policy "schedule_changes_delete" on public.schedule_changes for delete to authenticated
  using (public.is_manager());

-- learning_logs
create policy "learning_logs_select" on public.learning_logs for select to authenticated
  using (public.is_manager() or public.teaches(class_type));
create policy "learning_logs_insert" on public.learning_logs for insert to authenticated
  with check (public.is_manager() or public.teaches(class_type));
create policy "learning_logs_update" on public.learning_logs for update to authenticated
  using (public.is_manager() or public.teaches(class_type))
  with check (public.is_manager() or public.teaches(class_type));
create policy "learning_logs_delete" on public.learning_logs for delete to authenticated
  using (public.is_manager());

-- class_schedule (đọc chung, chỉ quản lý sửa)
create policy "class_schedule_select" on public.class_schedule for select to authenticated using (true);
create policy "class_schedule_write" on public.class_schedule for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- finance_entries / expense_categories / telegram_settings: chỉ quản lý
create policy "finance_manager_only" on public.finance_entries for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "expense_categories_manager_only" on public.expense_categories for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "telegram_manager_only" on public.telegram_settings for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

grant select, insert, update, delete on public.students, public.people, public.attendance,
  public.tuition_payments, public.schedule_changes, public.learning_logs, public.class_schedule,
  public.finance_entries, public.expense_categories, public.telegram_settings to authenticated;
