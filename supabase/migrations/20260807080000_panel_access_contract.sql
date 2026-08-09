create type public.panel_role as enum ('hr_admin', 'pm');

create table public.panel_accounts (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role public.panel_role not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default statement_timestamp(),
  updated_at timestamp with time zone not null default statement_timestamp()
);

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create function private.current_panel_role()
returns public.panel_role
language sql
stable
security definer
set search_path = ''
as $$
  select panel_account.role
  from public.panel_accounts as panel_account
  where panel_account.user_id = (select auth.uid())
    and panel_account.active
  limit 1
$$;

create function private.has_active_panel_grant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_panel_role() is not null
$$;

create function private.is_active_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_panel_role() = 'hr_admin'::public.panel_role, false)
$$;

create function private.set_panel_account_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.current_panel_role() from public, anon, authenticated;
revoke all on function private.has_active_panel_grant() from public, anon, authenticated;
revoke all on function private.is_active_hr_admin() from public, anon, authenticated;
revoke all on function private.set_panel_account_updated_at() from public, anon, authenticated;

grant execute on function private.current_panel_role() to authenticated;
grant execute on function private.has_active_panel_grant() to authenticated;
grant execute on function private.is_active_hr_admin() to authenticated;

create trigger set_panel_accounts_updated_at
before update on public.panel_accounts
for each row
execute function private.set_panel_account_updated_at();

alter table public.panel_accounts enable row level security;
alter table public.panel_accounts force row level security;

revoke all on table public.panel_accounts from public, anon, authenticated;
grant select, insert, update on table public.panel_accounts to authenticated;

create policy "panel users can read their own grant or HR can read all grants"
on public.panel_accounts
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_active_hr_admin())
);

create policy "active HR can create panel grants"
on public.panel_accounts
for insert
to authenticated
with check ((select private.is_active_hr_admin()));

create policy "active HR can update panel grants"
on public.panel_accounts
for update
to authenticated
using ((select private.is_active_hr_admin()))
with check ((select private.is_active_hr_admin()));

