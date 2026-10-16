-- =====================================================================
-- GymOS · Esquema completo para Supabase (PostgreSQL 15+)
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- Idempotencia: pensado para una base nueva. Ejecutar una sola vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------
create type public.app_module as enum
  ('members','finances','settings','checkin','routines','pos','staff','reports');
create type public.perm_action as enum ('create','read','update','delete','export');
create type public.membership_status as enum ('active','frozen','expired','debtor','cancelled');
create type public.payment_method as enum ('cash','card','transfer','wallet');
create type public.plan_kind as enum ('daily','monthly','quarterly','annual','class_pack');
create type public.checkin_result as enum ('granted','warning','denied');
create type public.register_status as enum ('open','closed');
create type public.sale_kind as enum ('product','membership');
create type public.booking_status as enum ('booked','attended','cancelled');

-- ---------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------
create table public.business_settings (
  id                    smallint primary key default 1 check (id = 1),
  name                  text not null default 'Mi Gimnasio',
  tax_id                text,
  address               text,
  phone                 text,
  email                 text,
  currency              text not null default 'S/' check (currency in ('S/','$','€')),
  timezone              text not null default 'America/Lima',
  logo_path             text,
  payment_qr_path       text,
  freeze_max_days       integer not null default 30 check (freeze_max_days between 0 and 365),
  tolerance_days        integer not null default 0 check (tolerance_days between 0 and 30),
  expiry_warning_days   integer not null default 3 check (expiry_warning_days between 0 and 30),
  opening_hours         jsonb not null default '{"weekdays":"06:00-22:00","saturday":"07:00-18:00","sunday":"08:00-13:00"}'::jsonb,
  notifications_enabled boolean not null default false,
  reminder_days_before  integer not null default 3 check (reminder_days_before between 0 and 30),
  whatsapp_webhook_url  text,
  email_webhook_url     text,
  reminder_template     text not null default 'Hola {nombre}, tu membresía {plan} vence el {fecha} ({dias} días). ¡Te esperamos para renovar!',
  updated_at            timestamptz not null default now()
);
insert into public.business_settings (id) values (1);

create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id     uuid primary key default gen_random_uuid(),
  module public.app_module not null,
  action public.perm_action not null,
  unique (module, action)
);

create table public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  role_id     uuid references public.roles(id) on delete set null,
  branch_id   uuid references public.branches(id) on delete set null,
  avatar_path text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role_id);

create table public.user_permission_overrides (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted       boolean not null,
  primary key (user_id, permission_id)
);

create table public.members (
  id                uuid primary key default gen_random_uuid(),
  dni               text not null unique check (dni ~ '^[A-Za-z0-9]{6,15}$'),
  first_name        text not null check (length(first_name) between 1 and 80),
  last_name         text not null check (length(last_name) between 1 and 80),
  email             text,
  phone             text,
  birth_date        date,
  gender            text check (gender in ('M','F','O')),
  photo_path        text,
  medical_notes     text,
  emergency_contact text,
  qr_token          uuid not null unique default gen_random_uuid(),
  status            public.membership_status not null default 'expired',
  trainer_id        uuid references public.profiles(id) on delete set null,
  branch_id         uuid references public.branches(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index members_status_idx on public.members(status);
create index members_trainer_idx on public.members(trainer_id);
create index members_name_idx on public.members (lower(last_name), lower(first_name));
create index members_created_idx on public.members(created_at desc);

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          public.plan_kind not null,
  duration_days integer not null check (duration_days between 1 and 1095),
  price         numeric(12,2) not null check (price >= 0),
  class_credits integer check (class_credits is null or class_credits > 0),
  description   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.cash_register (
  id               uuid primary key default gen_random_uuid(),
  opened_by        uuid not null references public.profiles(id),
  opened_at        timestamptz not null default now(),
  opening_amount   numeric(12,2) not null check (opening_amount >= 0),
  closed_by        uuid references public.profiles(id),
  closed_at        timestamptz,
  expected_amount  numeric(12,2),
  declared_amount  numeric(12,2),
  difference       numeric(12,2),
  status           public.register_status not null default 'open',
  notes            text
);
create unique index cash_register_one_open_per_user on public.cash_register(opened_by) where status = 'open';
create index cash_register_opened_idx on public.cash_register(opened_at desc);

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_register(id),
  member_id        uuid references public.members(id) on delete set null,
  kind             public.sale_kind not null,
  payment_method   public.payment_method not null,
  total            numeric(12,2) not null check (total >= 0),
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index sales_created_idx on public.sales(created_at desc);
create index sales_register_idx on public.sales(cash_register_id);
create index sales_member_idx on public.sales(member_id);

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  sku        text unique,
  name       text not null,
  category   text not null default 'General',
  price      numeric(12,2) not null check (price >= 0),
  cost       numeric(12,2) not null default 0 check (cost >= 0),
  stock      integer not null default 0 check (stock >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  plan_id     uuid references public.plans(id) on delete set null,
  description text not null,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  subtotal    numeric(12,2) not null check (subtotal >= 0)
);
create index sale_items_sale_idx on public.sale_items(sale_id);

create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.members(id) on delete cascade,
  plan_id          uuid not null references public.plans(id),
  start_date       date not null,
  end_date         date not null,
  price            numeric(12,2) not null check (price >= 0),
  amount_paid      numeric(12,2) not null default 0 check (amount_paid >= 0),
  status           public.membership_status not null default 'active',
  frozen_at        date,
  freeze_days_used integer not null default 0,
  sale_id          uuid references public.sales(id) on delete set null,
  created_by       uuid references public.profiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  check (end_date >= start_date),
  check (amount_paid <= price)
);
create index memberships_member_idx on public.memberships(member_id, end_date desc);
create index memberships_end_idx on public.memberships(end_date) where status = 'active';

create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  result        public.checkin_result not null,
  reason        text,
  checked_by    uuid references public.profiles(id) default auth.uid()
);
create index attendance_member_idx on public.attendance(member_id, checked_in_at desc);
create index attendance_time_idx on public.attendance(checked_in_at desc);

create table public.routines (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null default auth.uid(),
  title      text not null,
  goal       text,
  exercises  jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  start_date date not null default current_date,
  end_date   date,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index routines_member_idx on public.routines(member_id);
create index routines_trainer_idx on public.routines(trainer_id);

create table public.group_classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  discipline   text not null check (discipline in ('CrossFit','Spinning','Yoga','Funcional','Otro')),
  trainer_id   uuid references public.profiles(id) on delete set null,
  starts_at    timestamptz not null,
  duration_min integer not null default 60 check (duration_min between 15 and 240),
  capacity     integer not null check (capacity between 1 and 500),
  location     text,
  created_at   timestamptz not null default now()
);
create index group_classes_start_idx on public.group_classes(starts_at);

create table public.class_bookings (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.group_classes(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  status     public.booking_status not null default 'booked',
  created_at timestamptz not null default now(),
  unique (class_id, member_id)
);

create table public.notification_log (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.members(id) on delete set null,
  channel    text not null check (channel in ('whatsapp','email')),
  payload    jsonb not null,
  status     text not null check (status in ('sent','failed')),
  error      text,
  created_at timestamptz not null default now()
);
create index notification_log_created_idx on public.notification_log(created_at desc);

-- ---------------------------------------------------------------------
-- 3. SEEDS DE RBAC
-- ---------------------------------------------------------------------
insert into public.permissions (module, action)
select m, a
from unnest(enum_range(null::public.app_module)) m
cross join unnest(enum_range(null::public.perm_action)) a;

insert into public.roles (key, name, description) values
  ('super_admin',  'Super Admin',               'Acceso total al sistema, configuración y finanzas'),
  ('branch_admin', 'Administrador de Sucursal', 'Gestión operativa y de personal local'),
  ('receptionist', 'Recepcionista',             'Check-in, registro de socios y POS de barra'),
  ('trainer',      'Entrenador',                'Rutinas, clases y alumnos asignados'),
  ('auditor',      'Contador / Auditor',        'Solo lectura de reportes financieros y arqueos');

create or replace function public._seed_grant(p_role text, p_module public.app_module, p_actions public.perm_action[])
returns void language sql as $$
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r, public.permissions p
  where r.key = p_role and p.module = p_module and p.action = any(p_actions)
  on conflict do nothing;
$$;

-- super_admin: se evalúa como acceso total en has_permission(); igual se le asigna todo explícitamente.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin';

select public._seed_grant('branch_admin','members',  array['create','read','update','delete','export']::public.perm_action[]);
select public._seed_grant('branch_admin','checkin',  array['create','read','export']::public.perm_action[]);
select public._seed_grant('branch_admin','pos',      array['create','read','update','export']::public.perm_action[]);
select public._seed_grant('branch_admin','finances', array['read','update','export']::public.perm_action[]);
select public._seed_grant('branch_admin','routines', array['create','read','update','delete','export']::public.perm_action[]);
select public._seed_grant('branch_admin','reports',  array['read','export']::public.perm_action[]);
select public._seed_grant('branch_admin','staff',    array['create','read','update']::public.perm_action[]);
select public._seed_grant('branch_admin','settings', array['read']::public.perm_action[]);

select public._seed_grant('receptionist','members',  array['create','read','update']::public.perm_action[]);
select public._seed_grant('receptionist','checkin',  array['create','read']::public.perm_action[]);
select public._seed_grant('receptionist','pos',      array['create','read']::public.perm_action[]);
select public._seed_grant('receptionist','routines', array['read']::public.perm_action[]);

select public._seed_grant('trainer','routines', array['create','read','update','delete']::public.perm_action[]);
select public._seed_grant('trainer','checkin',  array['read']::public.perm_action[]);

select public._seed_grant('auditor','finances', array['read','export']::public.perm_action[]);
select public._seed_grant('auditor','reports',  array['read','export']::public.perm_action[]);
select public._seed_grant('auditor','pos',      array['read']::public.perm_action[]);

drop function public._seed_grant(text, public.app_module, public.perm_action[]);

insert into public.plans (name, kind, duration_days, price, description) values
  ('Pase diario',  'daily',      1,   15.00, 'Acceso por un día'),
  ('Mensual',      'monthly',    30,  120.00, 'Acceso libre 30 días'),
  ('Trimestral',   'quarterly',  90,  320.00, 'Acceso libre 90 días'),
  ('Anual',        'annual',     365, 1100.00, 'Acceso libre 365 días');
insert into public.plans (name, kind, duration_days, price, class_credits, description) values
  ('Pack 8 clases', 'class_pack', 30, 90.00, 8, 'Ocho clases grupales en 30 días');

-- ---------------------------------------------------------------------
-- 4. FUNCIONES DE SEGURIDAD (security definer → evitan recursión RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_role_key()
returns text language sql stable security definer set search_path = public as $$
  select r.key from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.active;
$$;

create or replace function public.has_permission(p_module public.app_module, p_action public.perm_action)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role_id uuid;
  v_role_key text;
  v_override boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select p.role_id, r.key into v_role_id, v_role_key
  from public.profiles p left join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.active;

  if not found then
    return false;
  end if;

  if v_role_key = 'super_admin' then
    return true;
  end if;

  select o.granted into v_override
  from public.user_permission_overrides o
  join public.permissions pe on pe.id = o.permission_id
  where o.user_id = auth.uid() and pe.module = p_module and pe.action = p_action;

  if v_override is not null then
    return v_override;
  end if;

  return exists (
    select 1 from public.role_permissions rp
    join public.permissions pe on pe.id = rp.permission_id
    where rp.role_id = v_role_id and pe.module = p_module and pe.action = p_action
  );
end;
$$;

create or replace function public.get_my_permissions()
returns table (module public.app_module, action public.perm_action)
language sql stable security definer set search_path = public as $$
  select p.module, p.action from public.permissions p
  where public.has_permission(p.module, p.action)
  order by p.module, p.action;
$$;

create or replace function public.business_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.business_settings where id = 1), 'UTC'))::date;
$$;

create or replace function public.assert_permission(p_module public.app_module, p_action public.perm_action)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(p_module, p_action) then
    raise exception 'No tienes permiso: %.%', p_module, p_action using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. PERFIL AUTOMÁTICO AL CREAR USUARIO
--    El primer usuario del sistema es Super Admin.
--    Los demás reciben el rol indicado en raw_app_meta_data.role_key
--    (solo el service_role puede escribir app_metadata). Sin rol → inactivo.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role_id uuid;
  v_is_first boolean;
  v_role_key text;
begin
  select not exists (select 1 from public.profiles) into v_is_first;
  v_role_key := case when v_is_first then 'super_admin' else new.raw_app_meta_data ->> 'role_key' end;
  select id into v_role_id from public.roles where key = v_role_key;

  insert into public.profiles (id, email, full_name, role_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role_id,
    v_role_id is not null
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Bloqueo de escalamiento de privilegios sobre perfiles
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new_key text;
  v_old_key text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.email := old.email;
  new.id := old.id;

  if new.role_id is distinct from old.role_id
     or new.active is distinct from old.active
     or new.branch_id is distinct from old.branch_id then
    if not public.has_permission('staff', 'update') then
      raise exception 'No tienes permiso para modificar roles o estados' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'No puedes cambiar tu propio rol o estado' using errcode = '42501';
    end if;
    select key into v_new_key from public.roles where id = new.role_id;
    select key into v_old_key from public.roles where id = old.role_id;
    if (v_new_key = 'super_admin' or v_old_key = 'super_admin')
       and coalesce(public.current_role_key(), '') <> 'super_admin' then
      raise exception 'Solo un Super Admin puede gestionar otros Super Admin' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
before update on public.profiles
for each row execute function public.guard_profile_update();

-- Gestión de la matriz de permisos (nadie puede otorgar lo que no tiene)
create or replace function public.set_role_permission(
  p_role_id uuid, p_module public.app_module, p_action public.perm_action, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_perm_id uuid;
  v_role_key text;
begin
  perform public.assert_permission('staff', 'update');
  select key into v_role_key from public.roles where id = p_role_id;
  if v_role_key is null then
    raise exception 'Rol no encontrado';
  end if;
  if v_role_key = 'super_admin' then
    raise exception 'El rol Super Admin siempre tiene acceso total';
  end if;
  if p_granted and not public.has_permission(p_module, p_action) then
    raise exception 'No puedes otorgar un permiso que tú no tienes' using errcode = '42501';
  end if;
  if coalesce(public.current_role_key(), '') <> 'super_admin' and v_role_key = 'branch_admin' then
    raise exception 'Solo un Super Admin puede editar el rol Administrador de Sucursal' using errcode = '42501';
  end if;

  select id into v_perm_id from public.permissions where module = p_module and action = p_action;
  if p_granted then
    insert into public.role_permissions (role_id, permission_id) values (p_role_id, v_perm_id)
    on conflict do nothing;
  else
    delete from public.role_permissions where role_id = p_role_id and permission_id = v_perm_id;
  end if;
end;
$$;

create or replace function public.set_user_override(
  p_user_id uuid, p_module public.app_module, p_action public.perm_action, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_perm_id uuid;
  v_target_key text;
begin
  perform public.assert_permission('staff', 'update');
  if p_user_id = auth.uid() then
    raise exception 'No puedes modificar tus propios permisos' using errcode = '42501';
  end if;
  select r.key into v_target_key from public.profiles p left join public.roles r on r.id = p.role_id where p.id = p_user_id;
  if v_target_key = 'super_admin' then
    raise exception 'Un Super Admin no admite excepciones de permisos';
  end if;
  if p_granted is true and not public.has_permission(p_module, p_action) then
    raise exception 'No puedes otorgar un permiso que tú no tienes' using errcode = '42501';
  end if;

  select id into v_perm_id from public.permissions where module = p_module and action = p_action;
  if p_granted is null then
    delete from public.user_permission_overrides where user_id = p_user_id and permission_id = v_perm_id;
  else
    insert into public.user_permission_overrides (user_id, permission_id, granted)
    values (p_user_id, v_perm_id, p_granted)
    on conflict (user_id, permission_id) do update set granted = excluded.granted;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. MEMBRESÍAS: ESTADO AUTOMÁTICO
-- ---------------------------------------------------------------------
create or replace function public.member_computed_status(p_member_id uuid)
returns public.membership_status language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tolerance integer;
begin
  select tolerance_days into v_tolerance from public.business_settings where id = 1;

  if exists (select 1 from public.memberships
             where member_id = p_member_id and status <> 'cancelled' and amount_paid < price) then
    return 'debtor';
  end if;
  if exists (select 1 from public.memberships
             where member_id = p_member_id and status = 'active'
               and start_date <= v_today and end_date + v_tolerance >= v_today) then
    return 'active';
  end if;
  if exists (select 1 from public.memberships where member_id = p_member_id and status = 'frozen') then
    return 'frozen';
  end if;
  if exists (select 1 from public.memberships
             where member_id = p_member_id and status = 'active' and start_date > v_today) then
    return 'active';
  end if;
  return 'expired';
end;
$$;

create or replace function public.refresh_member_status(p_member_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.members
  set status = public.member_computed_status(p_member_id), updated_at = now()
  where id = p_member_id;
$$;

create or replace function public.memberships_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_member_status(old.member_id);
    return old;
  end if;
  perform public.refresh_member_status(new.member_id);
  return new;
end;
$$;

create trigger memberships_refresh_status
after insert or update or delete on public.memberships
for each row execute function public.memberships_after_change();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger members_touch before update on public.members
for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.business_settings
for each row execute function public.touch_updated_at();

-- Tarea diaria (programar con pg_cron, ver README)
create or replace function public.expire_memberships()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tolerance integer;
  v_count integer;
begin
  select tolerance_days into v_tolerance from public.business_settings where id = 1;
  update public.memberships set status = 'expired'
  where status = 'active' and end_date + v_tolerance < v_today;
  get diagnostics v_count = row_count;

  update public.members m set status = public.member_computed_status(m.id)
  where m.status is distinct from public.member_computed_status(m.id);
  return v_count;
end;
$$;
revoke execute on function public.expire_memberships() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. CHECK-IN DE RECEPCIÓN
-- ---------------------------------------------------------------------
create or replace function public.check_in(p_identifier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.members%rowtype;
  v_ms public.memberships%rowtype;
  v_plan_name text;
  v_settings public.business_settings%rowtype;
  v_today date := public.business_today();
  v_result public.checkin_result;
  v_reason text;
  v_days integer;
  v_debt numeric(12,2);
  v_id text := trim(coalesce(p_identifier, ''));
begin
  perform public.assert_permission('checkin', 'create');
  if v_id = '' or length(v_id) > 64 then
    raise exception 'Identificador inválido' using errcode = '22023';
  end if;

  select * into v_settings from public.business_settings where id = 1;

  if v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_member from public.members where qr_token = v_id::uuid;
  else
    select * into v_member from public.members where dni = v_id;
  end if;

  if v_member.id is null then
    return jsonb_build_object('result', 'not_found', 'reason', 'Socio no encontrado');
  end if;

  select * into v_ms from public.memberships
  where member_id = v_member.id and status in ('active','frozen') and start_date <= v_today
  order by end_date desc limit 1;

  select coalesce(sum(price - amount_paid), 0) into v_debt
  from public.memberships where member_id = v_member.id and status <> 'cancelled' and amount_paid < price;

  if v_ms.id is null then
    v_result := 'denied'; v_reason := 'Sin membresía vigente';
  elsif v_ms.status = 'frozen' then
    v_result := 'denied'; v_reason := 'Membresía congelada';
  elsif v_debt > 0 then
    v_result := 'denied'; v_reason := 'Pago pendiente';
  else
    v_days := v_ms.end_date - v_today;
    if v_days < 0 then
      if -v_days <= v_settings.tolerance_days then
        v_result := 'warning'; v_reason := 'Vencida · en días de tolerancia';
      else
        v_result := 'denied'; v_reason := 'Membresía vencida';
      end if;
    elsif v_days <= v_settings.expiry_warning_days then
      v_result := 'warning'; v_reason := 'Por vencer';
    else
      v_result := 'granted'; v_reason := 'Acceso autorizado';
    end if;
  end if;

  if v_ms.id is not null then
    select name into v_plan_name from public.plans where id = v_ms.plan_id;
  end if;

  insert into public.attendance (member_id, membership_id, result, reason)
  values (v_member.id, v_ms.id, v_result, v_reason);

  return jsonb_build_object(
    'result', v_result,
    'reason', v_reason,
    'member_id', v_member.id,
    'full_name', v_member.first_name || ' ' || v_member.last_name,
    'dni', v_member.dni,
    'photo_path', v_member.photo_path,
    'medical_notes', v_member.medical_notes,
    'plan_name', v_plan_name,
    'end_date', v_ms.end_date,
    'days_left', case when v_ms.id is null then null else v_ms.end_date - v_today end,
    'debt', v_debt
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. CAJA Y VENTAS (transacciones atómicas con bloqueo pesimista)
-- ---------------------------------------------------------------------
create or replace function public.my_open_register()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.cash_register where opened_by = auth.uid() and status = 'open' limit 1;
$$;

create or replace function public.open_cash_register(p_opening_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.assert_permission('pos', 'create');
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'Monto de apertura inválido' using errcode = '22023';
  end if;
  if public.my_open_register() is not null then
    raise exception 'Ya tienes una caja abierta';
  end if;
  insert into public.cash_register (opened_by, opening_amount)
  values (auth.uid(), round(p_opening_amount, 2))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cash_register_summary(p_register_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_reg public.cash_register%rowtype;
  v_by_method jsonb;
  v_cash numeric(12,2);
  v_total numeric(12,2);
  v_count integer;
begin
  select * into v_reg from public.cash_register where id = p_register_id;
  if v_reg.id is null then
    raise exception 'Caja no encontrada';
  end if;
  if v_reg.opened_by <> auth.uid() and not public.has_permission('finances', 'read') then
    raise exception 'No tienes permiso para ver esta caja' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_by_method
  from (select payment_method, sum(total) as total from public.sales
        where cash_register_id = p_register_id group by payment_method) t;

  select coalesce(sum(total) filter (where payment_method = 'cash'), 0),
         coalesce(sum(total), 0), count(*)
  into v_cash, v_total, v_count
  from public.sales where cash_register_id = p_register_id;

  return jsonb_build_object(
    'register_id', v_reg.id,
    'status', v_reg.status,
    'opened_at', v_reg.opened_at,
    'closed_at', v_reg.closed_at,
    'opening_amount', v_reg.opening_amount,
    'by_method', v_by_method,
    'sales_total', v_total,
    'sales_count', v_count,
    'expected_cash', v_reg.opening_amount + v_cash,
    'declared_amount', v_reg.declared_amount,
    'difference', v_reg.difference
  );
end;
$$;

create or replace function public.close_cash_register(p_register_id uuid, p_declared_amount numeric, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reg public.cash_register%rowtype;
  v_cash numeric(12,2);
  v_expected numeric(12,2);
begin
  perform public.assert_permission('pos', 'create');
  select * into v_reg from public.cash_register where id = p_register_id for update;
  if v_reg.id is null then
    raise exception 'Caja no encontrada';
  end if;
  if v_reg.status <> 'open' then
    raise exception 'La caja ya está cerrada';
  end if;
  if v_reg.opened_by <> auth.uid() and not public.has_permission('finances', 'update') then
    raise exception 'Solo el cajero responsable puede cerrar esta caja' using errcode = '42501';
  end if;
  if p_declared_amount is null or p_declared_amount < 0 then
    raise exception 'Monto declarado inválido' using errcode = '22023';
  end if;

  select coalesce(sum(total), 0) into v_cash
  from public.sales where cash_register_id = p_register_id and payment_method = 'cash';
  v_expected := v_reg.opening_amount + v_cash;

  update public.cash_register set
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    expected_amount = v_expected,
    declared_amount = round(p_declared_amount, 2),
    difference = round(p_declared_amount, 2) - v_expected,
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_register_id;

  return public.cash_register_summary(p_register_id);
end;
$$;

-- p_items: [{"product_id": "...", "quantity": 2}, ...]
create or replace function public.register_sale(p_items jsonb, p_payment_method public.payment_method, p_member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_register uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
begin
  perform public.assert_permission('pos', 'create');
  v_register := public.my_open_register();
  if v_register is null then
    raise exception 'Debes abrir una caja antes de vender';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Demasiados ítems en una venta' using errcode = '22023';
  end if;

  insert into public.sales (cash_register_id, member_id, kind, payment_method, total, created_by)
  values (v_register, p_member_id, 'product', p_payment_method, 0, auth.uid())
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 999 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;

    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if v_product.id is null or not v_product.active then
      raise exception 'Producto no disponible';
    end if;
    if v_product.stock < v_qty then
      raise exception 'Stock insuficiente para "%" (disponible: %)', v_product.name, v_product.stock;
    end if;

    update public.products set stock = stock - v_qty where id = v_product.id;

    insert into public.sale_items (sale_id, product_id, description, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_product.name, v_qty, v_product.price, v_product.price * v_qty);

    v_total := v_total + v_product.price * v_qty;
  end loop;

  update public.sales set total = v_total where id = v_sale_id;
  return jsonb_build_object('sale_id', v_sale_id, 'total', v_total);
end;
$$;

create or replace function public.sell_membership(
  p_member_id uuid,
  p_plan_id uuid,
  p_payment_method public.payment_method,
  p_amount_paid numeric,
  p_start_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_register uuid;
  v_plan public.plans%rowtype;
  v_member_exists boolean;
  v_start date;
  v_end date;
  v_last_end date;
  v_sale_id uuid;
  v_ms_id uuid;
  v_today date := public.business_today();
begin
  perform public.assert_permission('pos', 'create');
  v_register := public.my_open_register();
  if v_register is null then
    raise exception 'Debes abrir una caja antes de cobrar';
  end if;

  select exists (select 1 from public.members where id = p_member_id) into v_member_exists;
  if not v_member_exists then
    raise exception 'Socio no encontrado';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and active;
  if v_plan.id is null then
    raise exception 'Plan no disponible';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_plan.price then
    raise exception 'El monto pagado debe estar entre 0 y %', v_plan.price using errcode = '22023';
  end if;

  -- Renovación encadenada: empieza al día siguiente del fin vigente
  perform 1 from public.members where id = p_member_id for update;
  select max(end_date) into v_last_end from public.memberships
  where member_id = p_member_id and status in ('active','frozen') and end_date >= v_today;

  v_start := coalesce(p_start_date, case when v_last_end is not null then v_last_end + 1 else v_today end);
  if v_start < v_today - 7 then
    raise exception 'La fecha de inicio no puede ser anterior a 7 días' using errcode = '22023';
  end if;
  v_end := v_start + v_plan.duration_days - 1;

  insert into public.sales (cash_register_id, member_id, kind, payment_method, total, created_by)
  values (v_register, p_member_id, 'membership', p_payment_method, round(p_amount_paid, 2), auth.uid())
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, plan_id, description, quantity, unit_price, subtotal)
  values (v_sale_id, v_plan.id, 'Membresía ' || v_plan.name, 1, round(p_amount_paid, 2), round(p_amount_paid, 2));

  insert into public.memberships (member_id, plan_id, start_date, end_date, price, amount_paid, status, sale_id)
  values (p_member_id, v_plan.id, v_start, v_end, v_plan.price, round(p_amount_paid, 2), 'active', v_sale_id)
  returning id into v_ms_id;

  return jsonb_build_object('membership_id', v_ms_id, 'sale_id', v_sale_id,
                            'start_date', v_start, 'end_date', v_end,
                            'debt', v_plan.price - round(p_amount_paid, 2));
end;
$$;

create or replace function public.pay_membership_debt(p_membership_id uuid, p_amount numeric, p_payment_method public.payment_method)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_register uuid;
  v_ms public.memberships%rowtype;
  v_sale_id uuid;
begin
  perform public.assert_permission('pos', 'create');
  v_register := public.my_open_register();
  if v_register is null then
    raise exception 'Debes abrir una caja antes de cobrar';
  end if;

  select * into v_ms from public.memberships where id = p_membership_id for update;
  if v_ms.id is null then
    raise exception 'Membresía no encontrada';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > (v_ms.price - v_ms.amount_paid) then
    raise exception 'Monto inválido. Saldo pendiente: %', v_ms.price - v_ms.amount_paid using errcode = '22023';
  end if;

  insert into public.sales (cash_register_id, member_id, kind, payment_method, total, created_by)
  values (v_register, v_ms.member_id, 'membership', p_payment_method, round(p_amount, 2), auth.uid())
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, plan_id, description, quantity, unit_price, subtotal)
  values (v_sale_id, v_ms.plan_id, 'Abono a membresía', 1, round(p_amount, 2), round(p_amount, 2));

  update public.memberships set amount_paid = amount_paid + round(p_amount, 2) where id = v_ms.id;

  return jsonb_build_object('sale_id', v_sale_id, 'remaining', v_ms.price - v_ms.amount_paid - round(p_amount, 2));
end;
$$;

-- Congelamiento según política del negocio
create or replace function public.freeze_membership(p_membership_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ms public.memberships%rowtype;
  v_max integer;
begin
  perform public.assert_permission('members', 'update');
  select freeze_max_days into v_max from public.business_settings where id = 1;
  select * into v_ms from public.memberships where id = p_membership_id for update;
  if v_ms.id is null or v_ms.status <> 'active' then
    raise exception 'Solo se pueden congelar membresías activas';
  end if;
  if v_ms.freeze_days_used >= v_max then
    raise exception 'Se alcanzó el máximo de % días de congelamiento', v_max;
  end if;
  update public.memberships set status = 'frozen', frozen_at = public.business_today() where id = v_ms.id;
end;
$$;

create or replace function public.unfreeze_membership(p_membership_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ms public.memberships%rowtype;
  v_max integer;
  v_days integer;
begin
  perform public.assert_permission('members', 'update');
  select freeze_max_days into v_max from public.business_settings where id = 1;
  select * into v_ms from public.memberships where id = p_membership_id for update;
  if v_ms.id is null or v_ms.status <> 'frozen' then
    raise exception 'La membresía no está congelada';
  end if;
  v_days := least(public.business_today() - v_ms.frozen_at, greatest(v_max - v_ms.freeze_days_used, 0));
  update public.memberships set
    status = 'active',
    end_date = end_date + v_days,
    freeze_days_used = freeze_days_used + v_days,
    frozen_at = null
  where id = v_ms.id;
end;
$$;

create or replace function public.cancel_membership(p_membership_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_permission('members', 'delete');
  update public.memberships set status = 'cancelled' where id = p_membership_id;
  if not found then
    raise exception 'Membresía no encontrada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. CLASES GRUPALES (control de aforo)
-- ---------------------------------------------------------------------
create or replace function public.book_class(p_class_id uuid, p_member_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_class public.group_classes%rowtype;
  v_taken integer;
  v_id uuid;
begin
  if not (public.has_permission('routines', 'create') or public.has_permission('checkin', 'create')) then
    raise exception 'No tienes permiso para reservar clases' using errcode = '42501';
  end if;
  select * into v_class from public.group_classes where id = p_class_id for update;
  if v_class.id is null then
    raise exception 'Clase no encontrada';
  end if;
  if v_class.starts_at + make_interval(mins => v_class.duration_min) < now() then
    raise exception 'La clase ya finalizó';
  end if;
  select count(*) into v_taken from public.class_bookings where class_id = p_class_id and status <> 'cancelled';
  if v_taken >= v_class.capacity then
    raise exception 'Aforo completo (% / %)', v_taken, v_class.capacity;
  end if;
  insert into public.class_bookings (class_id, member_id) values (p_class_id, p_member_id)
  on conflict (class_id, member_id) do update set status = 'booked'
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_booking_status(p_booking_id uuid, p_status public.booking_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('routines', 'update') or public.has_permission('checkin', 'create')) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  update public.class_bookings set status = p_status where id = p_booking_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. REPORTES
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tz text := (select timezone from public.business_settings where id = 1);
  v_can_fin boolean := public.has_permission('finances', 'read');
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_members',  (select count(*) from public.members where status = 'active'),
    'debtor_members',  (select count(*) from public.members where status = 'debtor'),
    'expiring_soon',   (select count(distinct member_id) from public.memberships
                        where status = 'active' and end_date between v_today and v_today + 7),
    'checkins_today',  (select count(*) from public.attendance
                        where (checked_in_at at time zone v_tz)::date = v_today and result <> 'denied'),
    'revenue_today',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where (created_at at time zone v_tz)::date = v_today) end,
    'revenue_month',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where date_trunc('month', created_at at time zone v_tz) = date_trunc('month', v_today::timestamp)) end
  );
end;
$$;

create or replace function public.revenue_report(p_from date, p_to date)
returns table (day date, payment_method public.payment_method, kind public.sale_kind, total numeric, sales_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := (select timezone from public.business_settings where id = 1);
begin
  perform public.assert_permission('finances', 'read');
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Rango de fechas inválido (máximo 1 año)' using errcode = '22023';
  end if;
  return query
    select (s.created_at at time zone v_tz)::date, s.payment_method, s.kind, sum(s.total), count(*)
    from public.sales s
    where (s.created_at at time zone v_tz)::date between p_from and p_to
    group by 1, 2, 3
    order by 1;
end;
$$;

create or replace function public.members_due_for_reminder(p_days integer)
returns table (member_id uuid, full_name text, phone text, email text, plan_name text, end_date date, days_left integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.business_today();
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.has_permission('settings', 'update') then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  return query
    select m.id, m.first_name || ' ' || m.last_name, m.phone, m.email, p.name, ms.end_date, ms.end_date - v_today
    from public.memberships ms
    join public.members m on m.id = ms.member_id
    join public.plans p on p.id = ms.plan_id
    where ms.status = 'active'
      and ms.end_date between v_today and v_today + p_days
      and not exists (select 1 from public.memberships n
                      where n.member_id = ms.member_id and n.status = 'active' and n.start_date > ms.end_date);
end;
$$;

-- ---------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.business_settings          enable row level security;
alter table public.branches                   enable row level security;
alter table public.roles                      enable row level security;
alter table public.permissions                enable row level security;
alter table public.role_permissions           enable row level security;
alter table public.profiles                   enable row level security;
alter table public.user_permission_overrides  enable row level security;
alter table public.members                    enable row level security;
alter table public.plans                      enable row level security;
alter table public.memberships                enable row level security;
alter table public.attendance                 enable row level security;
alter table public.cash_register              enable row level security;
alter table public.products                   enable row level security;
alter table public.sales                      enable row level security;
alter table public.sale_items                 enable row level security;
alter table public.routines                   enable row level security;
alter table public.group_classes              enable row level security;
alter table public.class_bookings             enable row level security;
alter table public.notification_log           enable row level security;

-- Ajustes
create policy settings_select on public.business_settings for select to authenticated using (true);
create policy settings_update on public.business_settings for update to authenticated
  using (public.has_permission('settings','update')) with check (public.has_permission('settings','update'));

create policy branches_select on public.branches for select to authenticated using (true);
create policy branches_write on public.branches for all to authenticated
  using (public.has_permission('settings','update')) with check (public.has_permission('settings','update'));

-- Catálogo RBAC (escrituras solo vía RPC security definer)
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- Perfiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('staff','read') or public.has_permission('routines','read'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('staff','update'))
  with check (id = auth.uid() or public.has_permission('staff','update'));

create policy overrides_select on public.user_permission_overrides for select to authenticated
  using (user_id = auth.uid() or public.has_permission('staff','read'));

-- Socios
create policy members_select on public.members for select to authenticated
  using (public.has_permission('members','read')
         or (trainer_id = auth.uid() and public.has_permission('routines','read')));
create policy members_insert on public.members for insert to authenticated
  with check (public.has_permission('members','create'));
create policy members_update on public.members for update to authenticated
  using (public.has_permission('members','update')) with check (public.has_permission('members','update'));
create policy members_delete on public.members for delete to authenticated
  using (public.has_permission('members','delete'));

-- Planes
create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_insert on public.plans for insert to authenticated with check (public.has_permission('settings','update'));
create policy plans_update on public.plans for update to authenticated
  using (public.has_permission('settings','update')) with check (public.has_permission('settings','update'));
create policy plans_delete on public.plans for delete to authenticated using (public.has_permission('settings','delete'));

-- Membresías (escrituras solo vía RPC)
create policy memberships_select on public.memberships for select to authenticated
  using (public.has_permission('members','read') or public.has_permission('finances','read'));

-- Asistencia (inserción solo vía check_in)
create policy attendance_select on public.attendance for select to authenticated
  using (public.has_permission('checkin','read') or public.has_permission('members','read'));

-- Caja (escrituras solo vía RPC)
create policy cash_select on public.cash_register for select to authenticated
  using (opened_by = auth.uid() or public.has_permission('finances','read'));

-- Productos
create policy products_select on public.products for select to authenticated using (public.has_permission('pos','read'));
create policy products_insert on public.products for insert to authenticated with check (public.has_permission('pos','update'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission('pos','update')) with check (public.has_permission('pos','update'));
create policy products_delete on public.products for delete to authenticated using (public.has_permission('pos','delete'));

-- Ventas: libro inmutable (sin políticas de UPDATE/DELETE)
create policy sales_select on public.sales for select to authenticated
  using (public.has_permission('finances','read') or created_by = auth.uid()
         or (member_id is not null and public.has_permission('members','read')));
create policy sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

-- Rutinas
create policy routines_select on public.routines for select to authenticated using (public.has_permission('routines','read'));
create policy routines_insert on public.routines for insert to authenticated with check (public.has_permission('routines','create'));
create policy routines_update on public.routines for update to authenticated
  using (public.has_permission('routines','update')) with check (public.has_permission('routines','update'));
create policy routines_delete on public.routines for delete to authenticated using (public.has_permission('routines','delete'));

-- Clases
create policy classes_select on public.group_classes for select to authenticated
  using (public.has_permission('routines','read') or public.has_permission('checkin','read'));
create policy classes_insert on public.group_classes for insert to authenticated with check (public.has_permission('routines','create'));
create policy classes_update on public.group_classes for update to authenticated
  using (public.has_permission('routines','update')) with check (public.has_permission('routines','update'));
create policy classes_delete on public.group_classes for delete to authenticated using (public.has_permission('routines','delete'));

create policy bookings_select on public.class_bookings for select to authenticated
  using (public.has_permission('routines','read') or public.has_permission('checkin','read'));

create policy notifications_select on public.notification_log for select to authenticated
  using (public.has_permission('settings','read'));

-- Las funciones no deben exponerse a anon (por defecto PUBLIC tiene EXECUTE)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.expire_memberships() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- ---------------------------------------------------------------------
-- 12. STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('branding', 'branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('member-photos', 'member-photos', false, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy branding_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.has_permission('settings','update'));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.has_permission('settings','update'));
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.has_permission('settings','update'));

create policy member_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos'
         and (public.has_permission('members','read') or public.has_permission('checkin','create')
              or public.has_permission('routines','read')));
create policy member_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos'
              and (public.has_permission('members','create') or public.has_permission('members','update')));
create policy member_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and public.has_permission('members','update'));
create policy member_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and public.has_permission('members','update'));
