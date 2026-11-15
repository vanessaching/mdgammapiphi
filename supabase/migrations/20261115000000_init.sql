-- =============================================================================
-- Chapter Hub — schema, permissions and row-level security
--
-- Security model
--   * Every table has RLS enabled. Nothing is readable by `anon`.
--   * Writes that need authorization logic (roles, excusal decisions,
--     attendance, invitations) go through SECURITY DEFINER functions that
--     check the caller's roles first. Clients have no direct write grant.
--   * Column-level grants stop users from writing columns they shouldn't
--     (e.g. an excusal's status, a profile's active flag).
--   * Helper functions live in the `private` schema, which PostgREST does
--     not expose.
-- =============================================================================

create extension if not exists citext with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
-- Tier drives permissions. Role *names* are free text so the chapter can
-- rename / add positions without touching code.
create type public.role_tier as enum ('president', 'exec', 'director', 'committee', 'member');
create type public.excusal_status as enum ('pending', 'approved', 'rejected');
create type public.attendance_status as enum ('present', 'excused', 'absent');
create type public.task_status as enum ('todo', 'in_progress', 'done');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null unique,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.invitations (
  email        extensions.citext primary key,
  full_name    text not null default '' check (char_length(full_name) <= 120),
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  name        text not null unique check (char_length(name) between 2 and 80),
  tier        public.role_tier not null,
  is_system   boolean not null default false,   -- president / VPO: can't be deleted or re-tiered
  sort_order  int not null default 100
);

create table public.member_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete restrict,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index on public.member_roles (role_id);

create table public.audit_log (
  id              bigint generated always as identity primary key,
  actor_id        uuid references public.profiles (id) on delete set null,
  action          text not null,
  target_user_id  uuid references public.profiles (id) on delete set null,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

create table public.events (
  id                      uuid primary key default gen_random_uuid(),
  google_event_id         text unique,
  title                   text not null check (char_length(title) between 1 and 300),
  description             text check (char_length(description) <= 10000),
  location                text check (char_length(location) <= 500),
  starts_at               timestamptz not null,
  ends_at                 timestamptz not null,
  is_required             boolean not null default false,
  points                  int not null default 0 check (points between 0 and 1000),
  excusal_deadline_hours  int not null default 48 check (excusal_deadline_hours between 0 and 720),
  allow_emergency         boolean not null default true,
  cancelled               boolean not null default false,
  attendance_taken        boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index on public.events (starts_at);

create table public.excusals (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason         text not null check (char_length(btrim(reason)) between 1 and 2000),
  is_emergency   boolean not null default false,
  proof_path     text check (char_length(proof_path) <= 300),
  status         public.excusal_status not null default 'pending',
  reviewer_id    uuid references public.profiles (id) on delete set null,
  reviewer_note  text check (char_length(reviewer_note) <= 1000),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (event_id, user_id)
);
create index on public.excusals (user_id);
create index on public.excusals (status);

create table public.attendance (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.attendance_status not null,
  marked_by  uuid references public.profiles (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index on public.attendance (user_id);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text check (char_length(description) <= 5000),
  due_date     date,
  status       public.task_status not null default 'todo',
  assignee_id  uuid not null references public.profiles (id) on delete cascade,
  assigned_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.tasks (assignee_id);
create index on public.tasks (assigned_by);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text check (link is null or link ~ '^/[A-Za-z0-9/_\-?=&]*$'),  -- internal links only
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.newsletters (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  issue_date  date not null default current_date,
  url         text check (url is null or url ~ '^https://[^\s<>"]+$'),
  body        text check (char_length(body) <= 50000),
  published   boolean not null default false,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (url is not null or body is not null)
);

-- ---------------------------------------------------------------------------
-- Seed: Pi Beta Phi chapter positions (editable by exec in the app)
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, tier, is_system, sort_order) values
  ('president',                'Chapter President',                    'president', true,  1),
  ('vp_operations',            'Vice President Operations',            'exec',      true,  10),
  ('vp_member_experience',     'Vice President Member Experience',     'exec',      false, 11),
  ('vp_risk_management',       'Vice President Risk Management',       'exec',      false, 12),
  ('vp_finance_housing',       'Vice President Finance/Housing',       'exec',      false, 13),
  ('vp_recruitment',           'Vice President Recruitment',           'exec',      false, 14),
  ('vp_community_relations',   'Vice President Community Relations',   'exec',      false, 15),
  ('vp_inclusion',             'Vice President Inclusion',             'exec',      false, 16),
  ('vp_event_management',      'Vice President Event Management',      'exec',      false, 17),
  ('dir_academic_excellence',  'Director of Academic Excellence',      'director',  false, 30),
  ('dir_philanthropy',         'Director of Philanthropy',             'director',  false, 31),
  ('dir_fundraising',          'Director of Fundraising',              'director',  false, 32),
  ('dir_sisterhood',           'Director of Sisterhood',               'director',  false, 33),
  ('dir_social_media',         'Director of Social Media',             'director',  false, 34),
  ('dir_public_relations',     'Director of Public Relations',         'director',  false, 35),
  ('dir_wellness',             'Director of Wellness',                 'director',  false, 36),
  ('dir_new_member_education', 'Director of New Member Education',     'director',  false, 37),
  ('dir_ritual',               'Director of Ritual',                   'director',  false, 38),
  ('dir_heritage',             'Director of Fraternity Heritage',      'director',  false, 39),
  ('dir_alumnae_relations',    'Director of Alumnae Relations',        'director',  false, 40),
  ('dir_social_events',        'Director of Social Events',            'director',  false, 41),
  ('dir_housing',              'Director of Housing',                  'director',  false, 42),
  ('mcc_chair',                'Member Conduct Committee Chair',       'committee', false, 60),
  ('mcc_member',               'Member Conduct Committee Member',      'committee', false, 61);

-- ---------------------------------------------------------------------------
-- Permission helpers (private schema = not callable through the REST API)
-- ---------------------------------------------------------------------------
create function private.tier_rank(t public.role_tier) returns int
language sql immutable set search_path = '' as $$
  select case t when 'president' then 4 when 'exec' then 3 when 'director' then 2 else 1 end
$$;

create function private.is_member(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = uid and active)
$$;

-- Highest rank among a user's roles. No roles = general member (1).
create function private.user_rank(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(private.tier_rank(r.tier)), 1)
  from public.member_roles mr join public.roles r on r.id = mr.role_id
  where mr.user_id = uid
$$;

create function private.has_role(role_key text, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr join public.roles r on r.id = mr.role_id
    where mr.user_id = uid and r.key = role_key
  )
$$;

create function private.is_president() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member() and private.has_role('president')
$$;

create function private.is_exec() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member() and private.user_rank(auth.uid()) >= 3
$$;

-- VPO duties (excusals, attendance, event settings, 80% view). The President
-- can do everything the VPO can.
create function private.can_manage_attendance() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member() and (private.has_role('president') or private.has_role('vp_operations'))
$$;

-- President: anyone. Exec (incl. VPO): directors + general/committee members.
-- Everyone: themselves.
create function private.can_assign_task(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member()
     and private.is_member(target)
     and (
       target = auth.uid()
       or private.is_president()
       or (private.is_exec() and private.user_rank(target) <= 2)
     )
$$;

create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, p_title, p_body, p_link)
$$;

create function private.audit(p_action text, p_target uuid, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_user_id, details)
  values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Auth: invite-only accounts
-- ---------------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where email = lower(new.email);
  if not found then
    raise exception 'Accounts are invite-only. Ask an exec member to invite %.', new.email
      using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), inv.full_name);
  update public.invitations set accepted_at = now() where email = inv.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Roles catalog guard
-- ---------------------------------------------------------------------------
create function private.guard_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'System role "%" cannot be deleted', old.name using errcode = '42501'; end if;
    perform private.audit('role_deleted', null, jsonb_build_object('role', old.name));
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.is_system := false;
  elsif old.is_system then
    if new.key <> old.key or new.tier <> old.tier then
      raise exception 'System role "%" cannot change key or tier', old.name using errcode = '42501';
    end if;
    new.is_system := true;
  end if;
  if new.tier = 'president' and new.key <> 'president' then
    raise exception 'Only the Chapter President role can have the president tier' using errcode = '42501';
  end if;
  perform private.audit(case tg_op when 'INSERT' then 'role_created' else 'role_updated' end, null,
    jsonb_build_object('role', new.name, 'tier', new.tier));
  return new;
end $$;

create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function private.guard_roles();

-- ---------------------------------------------------------------------------
-- Excusal rules: deadline, emergency window, proof ownership
-- ---------------------------------------------------------------------------
create function private.excusal_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  deadline timestamptz;
begin
  if auth.uid() is null then return new; end if;  -- service role / admin tooling

  -- Clients never control these fields.
  new.user_id := auth.uid();
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewer_note := null;
  new.reviewed_at := null;
  new.created_at := now();
  new.reason := btrim(new.reason);

  select * into ev from public.events where id = new.event_id;
  if not found then raise exception 'Event not found'; end if;
  if ev.cancelled then raise exception 'This event was cancelled' using errcode = '22023'; end if;

  deadline := ev.starts_at - make_interval(hours => ev.excusal_deadline_hours);
  if now() <= deadline then
    new.is_emergency := false;      -- not needed before the deadline
  elsif not new.is_emergency then
    raise exception 'The excusal deadline for this event has passed. Submit an emergency excusal instead.'
      using errcode = '22023';
  elsif not ev.allow_emergency then
    raise exception 'Emergency excusals are not allowed for this event' using errcode = '22023';
  elsif now() > ev.ends_at + interval '7 days' then
    raise exception 'Emergency excusals must be submitted within 7 days of the event' using errcode = '22023';
  end if;

  if new.proof_path is not null and new.proof_path not like auth.uid()::text || '/%' then
    raise exception 'Proof must be uploaded to your own folder' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger excusals_before_insert before insert on public.excusals
  for each row execute function private.excusal_before_insert();

-- ---------------------------------------------------------------------------
-- Task rules: assigner can edit; assignee can only move status
-- ---------------------------------------------------------------------------
create function private.task_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.assigned_by := auth.uid();
    return new;
  end if;
  new.assigned_by := old.assigned_by;
  if old.assigned_by = auth.uid() or private.is_president() then
    if new.assignee_id <> old.assignee_id and not private.can_assign_task(new.assignee_id) then
      raise exception 'You cannot assign tasks to that member' using errcode = '42501';
    end if;
  elsif (new.title, new.description, new.due_date, new.assignee_id)
        is distinct from (old.title, old.description, old.due_date, old.assignee_id) then
    raise exception 'Assignees can only change a task''s status' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function private.task_before_write();

create function private.task_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id <> new.assigned_by
     and (tg_op = 'INSERT' or new.assignee_id <> old.assignee_id) then
    perform private.notify(new.assignee_id, 'task_assigned', 'New task: ' || new.title,
      case when new.due_date is null then null else 'Due ' || to_char(new.due_date, 'Mon DD, YYYY') end,
      '/tasks');
  end if;
  return new;
end $$;

create trigger tasks_after_write after insert or update on public.tasks
  for each row execute function private.task_after_write();

-- ---------------------------------------------------------------------------
-- RPCs (public schema = callable by signed-in users; each checks permissions)
-- ---------------------------------------------------------------------------

-- What the signed-in user can do (used by the UI to show/hide controls; the
-- database enforces the same rules regardless).
create function public.my_permissions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_member',             private.is_member(),
    'is_president',          private.is_president(),
    'is_exec',               private.is_exec(),
    'is_vpo',                private.is_member() and private.has_role('vp_operations'),
    'can_manage_attendance', private.can_manage_attendance(),
    'rank',                  private.user_rank(auth.uid())
  )
$$;

-- Members the caller is allowed to assign tasks to.
create function public.assignable_members()
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.email::text from public.profiles p
  where p.active and private.can_assign_task(p.id)
  order by p.full_name
$$;

create function public.create_invitation(p_email text, p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email));
begin
  if not private.is_exec() then
    raise exception 'Only Executive Council members can invite members' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;
  insert into public.invitations (email, full_name, invited_by)
  values (v_email, coalesce(btrim(p_full_name), ''), auth.uid())
  on conflict (email) do update set full_name = excluded.full_name, invited_by = excluded.invited_by;
  perform private.audit('member_invited', null, jsonb_build_object('email', v_email));
end $$;

create function public.assign_role(p_user uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.roles; target_name text;
begin
  if not private.is_exec() then
    raise exception 'Only Executive Council members can assign roles' using errcode = '42501';
  end if;
  select full_name into target_name from public.profiles where id = p_user and active;
  if not found then raise exception 'Member not found or inactive' using errcode = '22023'; end if;
  select * into r from public.roles where id = p_role;
  if not found then raise exception 'Role not found' using errcode = '22023'; end if;

  insert into public.member_roles (user_id, role_id, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  if not found then return; end if;

  perform private.audit('role_granted', p_user, jsonb_build_object('role', r.name));
  perform private.notify(p_user, 'role_granted', 'You were given the role ' || r.name, null, '/members');
  -- Leadership changes are announced to the rest of exec so nothing happens quietly.
  if r.tier in ('president', 'exec') then
    perform private.notify(mr.user_id, 'leadership_change', 'Leadership change',
      target_name || ' was given the role ' || r.name, '/members')
    from (select distinct m.user_id from public.member_roles m join public.roles x on x.id = m.role_id
          where x.tier in ('president', 'exec') and m.user_id not in (auth.uid(), p_user)) mr;
  end if;
end $$;

create function public.revoke_role(p_user uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.roles; target_name text;
begin
  if not private.is_exec() then
    raise exception 'Only Executive Council members can remove roles' using errcode = '42501';
  end if;
  -- Lock the role row so two concurrent revokes can't both remove the last president.
  select * into r from public.roles where id = p_role for update;
  if not found then raise exception 'Role not found' using errcode = '22023'; end if;
  if r.key = 'president' and (
       select count(*) from public.member_roles m join public.profiles p on p.id = m.user_id
       where m.role_id = p_role and p.active) <= 1 then
    raise exception 'The chapter must always have a Chapter President. Assign a new one first.'
      using errcode = '42501';
  end if;

  delete from public.member_roles where user_id = p_user and role_id = p_role;
  if not found then return; end if;
  select full_name into target_name from public.profiles where id = p_user;

  perform private.audit('role_revoked', p_user, jsonb_build_object('role', r.name));
  perform private.notify(p_user, 'role_revoked', 'Your role ' || r.name || ' was removed', null, '/members');
  if r.tier in ('president', 'exec') then
    perform private.notify(mr.user_id, 'leadership_change', 'Leadership change',
      coalesce(target_name, 'A member') || ' was removed from ' || r.name, '/members')
    from (select distinct m.user_id from public.member_roles m join public.roles x on x.id = m.role_id
          where x.tier in ('president', 'exec') and m.user_id not in (auth.uid(), p_user)) mr;
  end if;
end $$;

create function public.set_member_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_exec() then
    raise exception 'Only Executive Council members can change member status' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot deactivate yourself' using errcode = '42501';
  end if;
  if not p_active and private.has_role('president', p_user) and (
       select count(*) from public.member_roles m join public.roles r on r.id = m.role_id
       join public.profiles p on p.id = m.user_id
       where r.key = 'president' and p.active) <= 1 then
    raise exception 'You cannot deactivate the only Chapter President' using errcode = '42501';
  end if;
  update public.profiles set active = p_active where id = p_user;
  if not found then raise exception 'Member not found' using errcode = '22023'; end if;
  perform private.audit(case when p_active then 'member_reactivated' else 'member_deactivated' end, p_user, '{}');
end $$;

create function public.decide_excusal(p_excusal uuid, p_decision public.excusal_status, p_note text)
returns public.excusals
language plpgsql security definer set search_path = '' as $$
declare ex public.excusals; ev public.events;
begin
  if not private.can_manage_attendance() then
    raise exception 'Only the VP Operations can approve or reject excusals' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;
  if char_length(p_note) > 1000 then raise exception 'Note is too long' using errcode = '22023'; end if;

  select * into ex from public.excusals where id = p_excusal for update;
  if not found then raise exception 'Excusal not found' using errcode = '22023'; end if;
  if ex.user_id = auth.uid() then
    raise exception 'You cannot review your own excusal' using errcode = '42501';
  end if;

  update public.excusals
     set status = p_decision, reviewer_id = auth.uid(),
         reviewer_note = nullif(btrim(p_note), ''), reviewed_at = now()
   where id = p_excusal returning * into ex;
  select * into ev from public.events where id = ex.event_id;

  if p_decision = 'approved' then
    insert into public.attendance (event_id, user_id, status, marked_by)
    values (ex.event_id, ex.user_id, 'excused', auth.uid())
    on conflict (event_id, user_id) do update
      set status = 'excused', marked_by = auth.uid(), marked_at = now()
      where public.attendance.status <> 'present';
  elsif ev.attendance_taken then
    update public.attendance set status = 'absent', marked_by = auth.uid(), marked_at = now()
     where event_id = ex.event_id and user_id = ex.user_id and status = 'excused';
  else
    delete from public.attendance
     where event_id = ex.event_id and user_id = ex.user_id and status = 'excused';
  end if;

  perform private.notify(ex.user_id, 'excusal_' || p_decision::text,
    'Excusal ' || p_decision::text || ': ' || ev.title, ex.reviewer_note, '/excusals');
  perform private.audit('excusal_' || p_decision::text, ex.user_id, jsonb_build_object('event', ev.title));
  return ex;
end $$;

-- Save an event's roster in one transaction. Everyone active not checked off
-- is absent unless they have an approved excusal.
create function public.save_attendance(p_event uuid, p_present uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_attendance() then
    raise exception 'Only the VP Operations can take attendance' using errcode = '42501';
  end if;
  perform 1 from public.events where id = p_event and not cancelled for update;
  if not found then raise exception 'Event not found or cancelled' using errcode = '22023'; end if;

  delete from public.attendance where event_id = p_event;
  insert into public.attendance (event_id, user_id, status, marked_by)
  select p_event, p.id,
         case
           when p.id = any (coalesce(p_present, '{}')) then 'present'::public.attendance_status
           when exists (select 1 from public.excusals x
                        where x.event_id = p_event and x.user_id = p.id and x.status = 'approved')
             then 'excused'
           else 'absent'
         end,
         auth.uid()
  from public.profiles p where p.active;
  update public.events set attendance_taken = true where id = p_event;
end $$;

revoke all on function
  public.my_permissions(), public.assignable_members(), public.create_invitation(text, text),
  public.assign_role(uuid, uuid), public.revoke_role(uuid, uuid), public.set_member_active(uuid, boolean),
  public.decide_excusal(uuid, public.excusal_status, text), public.save_attendance(uuid, uuid[])
from public, anon;
grant execute on function
  public.my_permissions(), public.assignable_members(), public.create_invitation(text, text),
  public.assign_role(uuid, uuid), public.revoke_role(uuid, uuid), public.set_member_active(uuid, boolean),
  public.decide_excusal(uuid, public.excusal_status, text), public.save_attendance(uuid, uuid[])
to authenticated;

-- ---------------------------------------------------------------------------
-- Stats view: points, events attended, attendance %
--   Attendance % = required attended / (required events - excused)
--   Only events where the VPO has saved attendance count.
-- ---------------------------------------------------------------------------
create view public.member_stats with (security_invoker = true) as
with att as (
  select a.user_id, a.status, e.points, e.is_required
  from public.attendance a join public.events e on e.id = a.event_id
  where e.attendance_taken and not e.cancelled
)
select
  p.id as user_id,
  p.full_name,
  coalesce(sum(att.points) filter (where att.status = 'present'), 0)::int        as points,
  count(*) filter (where att.status = 'present')::int                              as events_attended,
  count(*) filter (where att.is_required)::int                                     as required_total,
  count(*) filter (where att.is_required and att.status = 'present')::int          as required_attended,
  count(*) filter (where att.is_required and att.status = 'excused')::int          as required_excused,
  case
    when count(*) filter (where att.is_required and att.status <> 'excused') > 0
    then round(100.0 * count(*) filter (where att.is_required and att.status = 'present')
               / count(*) filter (where att.is_required and att.status <> 'excused'), 1)
  end as attendance_pct
from public.profiles p
left join att on att.user_id = p.id
where p.active and (p.id = auth.uid() or private.can_manage_attendance())
group by p.id, p.full_name;

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then grant only what each table needs
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;

grant update (full_name) on public.profiles to authenticated;
grant insert (key, name, tier, sort_order), update (name, tier, sort_order), delete on public.roles to authenticated;
grant insert (title, description, location, starts_at, ends_at, is_required, points, excusal_deadline_hours, allow_emergency),
      update (is_required, points, excusal_deadline_hours, allow_emergency),
      delete on public.events to authenticated;
grant insert (event_id, reason, is_emergency, proof_path), delete on public.excusals to authenticated;
grant insert (title, description, due_date, status, assignee_id),
      update (title, description, due_date, status, assignee_id),
      delete on public.tasks to authenticated;
grant update (read_at), delete on public.notifications to authenticated;
grant insert (title, issue_date, url, body, published),
      update (title, issue_date, url, body, published),
      delete on public.newsletters to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.invitations   enable row level security;
alter table public.roles         enable row level security;
alter table public.member_roles  enable row level security;
alter table public.audit_log     enable row level security;
alter table public.events        enable row level security;
alter table public.excusals      enable row level security;
alter table public.attendance    enable row level security;
alter table public.tasks         enable row level security;
alter table public.notifications enable row level security;
alter table public.newsletters   enable row level security;

-- profiles: chapter directory visible to members; edit only your own name
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_member()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_member()))
  with check (id = (select auth.uid()));

-- invitations / audit log: exec only (writes via RPCs)
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.is_exec()));
create policy audit_select on public.audit_log for select to authenticated
  using ((select private.is_exec()));

-- roles catalog: everyone reads, exec edits
create policy roles_select on public.roles for select to authenticated
  using ((select private.is_member()));
create policy roles_insert on public.roles for insert to authenticated
  with check ((select private.is_exec()));
create policy roles_update on public.roles for update to authenticated
  using ((select private.is_exec())) with check ((select private.is_exec()));
create policy roles_delete on public.roles for delete to authenticated
  using ((select private.is_exec()));

-- member_roles: everyone reads (writes via assign_role / revoke_role)
create policy member_roles_select on public.member_roles for select to authenticated
  using ((select private.is_member()));

-- events: everyone reads; VPO / President edit settings
create policy events_select on public.events for select to authenticated
  using ((select private.is_member()));
create policy events_insert on public.events for insert to authenticated
  with check ((select private.can_manage_attendance()));
create policy events_update on public.events for update to authenticated
  using ((select private.can_manage_attendance())) with check ((select private.can_manage_attendance()));
create policy events_delete on public.events for delete to authenticated
  using ((select private.can_manage_attendance()) and google_event_id is null);

-- excusals: own + VPO/President; members submit & withdraw while pending
create policy excusals_select on public.excusals for select to authenticated
  using ((select private.is_member()) and (user_id = (select auth.uid()) or (select private.can_manage_attendance())));
create policy excusals_insert on public.excusals for insert to authenticated
  with check ((select private.is_member()) and user_id = (select auth.uid()) and status = 'pending');
create policy excusals_delete_own_pending on public.excusals for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- attendance: own + VPO/President (writes via save_attendance / decide_excusal)
create policy attendance_select on public.attendance for select to authenticated
  using ((select private.is_member()) and (user_id = (select auth.uid()) or (select private.can_manage_attendance())));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using ((select private.is_member()) and (
    assignee_id = (select auth.uid()) or assigned_by = (select auth.uid()) or (select private.is_president())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (assigned_by = (select auth.uid()) and private.can_assign_task(assignee_id));
create policy tasks_update on public.tasks for update to authenticated
  using ((select private.is_member()) and (
    assignee_id = (select auth.uid()) or assigned_by = (select auth.uid()) or (select private.is_president())))
  with check ((select private.is_member()));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select private.is_member()) and (assigned_by = (select auth.uid()) or (select private.is_president())));

-- notifications: own only
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- newsletters: members read published issues; exec write
create policy newsletters_select on public.newsletters for select to authenticated
  using ((select private.is_member()) and (published or (select private.is_exec())));
create policy newsletters_insert on public.newsletters for insert to authenticated
  with check ((select private.is_exec()));
create policy newsletters_update on public.newsletters for update to authenticated
  using ((select private.is_exec())) with check ((select private.is_exec()));
create policy newsletters_delete on public.newsletters for delete to authenticated
  using ((select private.is_exec()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for excusal proof (photo or PDF, max 10 MB)
-- Files live at  <user id>/<random name>.  Members upload/read/delete their
-- own; the VPO / President can read all. No overwrites.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('excusal-proofs', 'excusal-proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

create policy proofs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'excusal-proofs'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.is_member()));
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'excusal-proofs' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.can_manage_attendance())));
create policy proofs_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'excusal-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Function privileges: lock down everything in `private`, then allow only the
-- read-only helpers that RLS policies call as the signed-in user. notify(),
-- audit() and trigger functions are reachable only from SECURITY DEFINER code.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.tier_rank(public.role_tier), private.is_member(uuid), private.user_rank(uuid),
  private.has_role(text, uuid), private.is_president(), private.is_exec(),
  private.can_manage_attendance(), private.can_assign_task(uuid)
to authenticated;
