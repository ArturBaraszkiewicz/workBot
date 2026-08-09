begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_type('public', 'panel_role', 'panel_role enum exists');
select enum_has_labels(
  'public',
  'panel_role',
  array['hr_admin', 'pm'],
  'panel_role exposes only the supported roles'
);
select has_table('public', 'panel_accounts', 'panel_accounts table exists');
select col_is_pk('public', 'panel_accounts', 'user_id', 'user_id is the primary key');
select col_is_fk('public', 'panel_accounts', 'user_id', 'user_id references auth.users');
select col_default_is(
  'public',
  'panel_accounts',
  'active',
  'true',
  'new panel grants are active by default'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.panel_accounts'::regclass
  ),
  'panel_accounts enables and forces RLS'
);
select ok(
  not has_table_privilege('anon', 'public.panel_accounts', 'SELECT'),
  'anonymous users have no table privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.panel_accounts', 'DELETE'),
  'application users cannot delete panel grants'
);
select ok(
  has_function_privilege('authenticated', 'private.current_panel_role()', 'EXECUTE')
    and not has_function_privilege('anon', 'private.current_panel_role()', 'EXECUTE'),
  'role helper execution is limited to authenticated users'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'hr@example.test',
    '',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'pm@example.test',
    '',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'other@example.test',
    '',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'inactive@example.test',
    '',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'unprovisioned@example.test',
    '',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  );

insert into public.panel_accounts (user_id, role, active)
values
  ('11111111-1111-4111-8111-111111111111', 'hr_admin', true),
  ('22222222-2222-4222-8222-222222222222', 'pm', true),
  ('33333333-3333-4333-8333-333333333333', 'pm', true),
  ('44444444-4444-4444-8444-444444444444', 'hr_admin', false);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.panel_accounts),
  1,
  'PM reads only their own grant'
);
select is(
  (select role::text from public.panel_accounts),
  'pm',
  'PM sees their current role'
);
select throws_ok(
  $$insert into public.panel_accounts (user_id, role) values ('55555555-5555-4555-8555-555555555555', 'pm')$$
);
with attempted_escalation as (
  update public.panel_accounts
  set role = 'hr_admin'
  where user_id = '22222222-2222-4222-8222-222222222222'
  returning user_id
)
select is(
  (select count(*)::integer from attempted_escalation),
  0,
  'PM cannot update their own role'
);
select throws_ok(
  $$delete from public.panel_accounts where user_id = '22222222-2222-4222-8222-222222222222'$$
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select is(
  (select active from public.panel_accounts),
  false,
  'inactive users can read their own inactive grant'
);
select is(private.has_active_panel_grant(), false, 'inactive grants are not active panel access');
select is(private.current_panel_role(), null::public.panel_role, 'inactive grants expose no active role');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.panel_accounts),
  0,
  'an unprovisioned user reads no grants'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.panel_accounts$$);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.panel_accounts),
  4,
  'active HR reads every grant'
);
select is(private.current_panel_role(), 'hr_admin'::public.panel_role, 'active HR resolves their role');
select is(private.has_active_panel_grant(), true, 'active HR has an active panel grant');
select is(private.is_active_hr_admin(), true, 'active HR passes the admin helper');
select lives_ok(
  $$insert into public.panel_accounts (user_id, role) values ('55555555-5555-4555-8555-555555555555', 'pm')$$,
  'active HR can create a grant'
);
select lives_ok(
  $$update public.panel_accounts
    set active = false, updated_at = '2000-01-01 00:00:00+00'
    where user_id = '33333333-3333-4333-8333-333333333333'$$,
  'active HR can update a grant'
);

reset role;
select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'::timestamp with time zone
    from public.panel_accounts
    where user_id = '33333333-3333-4333-8333-333333333333'
  ),
  'updated_at is maintained by the update trigger'
);

do $$
declare
  failure_summary text;
begin
  select string_agg(message, E'\n')
  into failure_summary
  from finish() as diagnostics(message);

  if failure_summary is not null then
    raise exception 'pgTAP failure:%', E'\n' || failure_summary;
  end if;
end;
$$;
rollback;
