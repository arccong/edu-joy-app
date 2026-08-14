-- Add toggle to optionally hide the "Đăng nhập" title on the login page
alter table public.brand_settings
  add column if not exists hide_login_title boolean not null default false;
