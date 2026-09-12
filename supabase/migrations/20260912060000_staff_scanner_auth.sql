create table public.staff_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  role text not null check (role in ('SCANNER','ADMIN')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;
create trigger staff_users_set_updated_at before update on public.staff_users for each row execute function public.set_updated_at();
