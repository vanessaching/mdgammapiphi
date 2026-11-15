-- =============================================================================
-- Create the FIRST account (run in Supabase → SQL Editor).
-- This person gets VP Operations, which can invite members and assign
-- positions (including making someone Chapter President) from the website.
--
-- Do PART 1, then send the invite from the dashboard, then PART 2.
-- Replace the email and name below (keep the quotes). Same email in both parts.
-- =============================================================================

-- PART 1: allow this email to have an account
insert into public.invitations (email, full_name)
values (lower('you@school.edu'), 'Your Full Name')
on conflict (email) do update set full_name = excluded.full_name;

-- ...now go to Authentication → Users → "Add user" → "Send invitation"
--    and enter the same email. Then come back and run PART 2.

-- PART 2: give them the VP Operations position
-- (to start as Chapter President instead, change 'vp_operations' to 'president')
insert into public.member_roles (user_id, role_id)
select u.id, r.id
from auth.users u
join public.roles r on r.key = 'vp_operations'
where u.email = lower('you@school.edu')
on conflict do nothing;

-- Check: should show your name with "Vice President Operations"
select p.full_name, p.email, r.name
from public.member_roles mr
join public.profiles p on p.id = mr.user_id
join public.roles r on r.id = mr.role_id
where p.email = lower('you@school.edu');
