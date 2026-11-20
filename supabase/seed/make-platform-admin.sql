-- Grant a registered user access to the internal platform-admin app.
-- Run in the Supabase SQL editor (as the postgres role). Replace the email.
-- Roles: super_admin | support | billing | analyst
insert into public.platform_staff (user_id, role)
select id, 'super_admin' from auth.users where email = 'founder@yourcompany.com'
on conflict (user_id) do update set role = excluded.role;
