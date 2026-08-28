-- cliptwo — seed the admin account
-- Run this in Supabase Dashboard -> SQL Editor -> Run.
-- Creates (or updates) the admin login: workclip11@gmail.com / 123456
-- and grants it the 'admin' role. Safe to re-run.
--
-- After this, sign in at the normal /login page with those credentials —
-- the account's role routes you to /admin automatically. There is no
-- public "admin" button on the site.

do $$
declare
  uid uuid;
  v_email text := 'workclip11@gmail.com';
  v_pass  text := '123456';
begin
  -- find any existing auth user with this email
  select id into uid from auth.users where email = v_email limit 1;

  if uid is null then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      jsonb_build_object('name', 'Admin', 'role', 'admin'),
      now(),
      now()
    )
    returning id into uid;
  else
    -- normalise the password to the expected one
    update auth.users
      set encrypted_password = crypt(v_pass, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_user_meta_data = jsonb_build_object('name', 'Admin', 'role', 'admin')
    where id = uid;
  end if;

  -- ensure the public profile exists with admin role
  insert into public.profiles (id, name, email, role, status, created_at)
  values (uid, 'Admin', v_email, 'admin', 'active', now())
  on conflict (id) do update
    set role = 'admin', status = 'active', email = v_email;
end $$;
