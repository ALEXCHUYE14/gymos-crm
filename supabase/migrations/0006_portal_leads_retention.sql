-- =====================================================================
-- GymOS · Portal del socio, prospectos (leads) y retención
-- Requiere 0001–0005. Seguro de ejecutar más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PORTAL DEL SOCIO
--    Cada socio puede tener un enlace secreto (/p/<token>) que el personal genera
--    y comparte. Sin token (null) el portal está desactivado para ese socio.
--    El portal no usa cuentas de Supabase Auth: todo pasa por las RPC portal_*,
--    que solo devuelven datos del socio dueño del token.
-- ---------------------------------------------------------------------
alter table public.members add column if not exists portal_token text
  check (portal_token is null or portal_token ~ '^[A-Za-z0-9_-]{32,64}$');
create unique index if not exists members_portal_token_idx
  on public.members(portal_token) where portal_token is not null;

-- Núcleo de la reserva (antes dentro de book_class). Sin control de permisos:
-- solo lo llaman book_class (personal, con permisos) y portal_book_class (socio, con token).
create or replace function public._book_class_core(p_class_id uuid, p_member_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_class public.group_classes%rowtype;
  v_settings public.business_settings%rowtype;
  v_class_day date;
  v_ms public.memberships%rowtype;
  v_existing public.class_bookings%rowtype;
  v_taken integer;
  v_id uuid;
begin
  -- Bloquear la clase serializa las reservas concurrentes (aforo y créditos)
  select * into v_class from public.group_classes where id = p_class_id for update;
  if v_class.id is null then
    raise exception 'Clase no encontrada';
  end if;
  if v_class.starts_at + make_interval(mins => v_class.duration_min) < now() then
    raise exception 'La clase ya finalizó';
  end if;

  select * into v_existing from public.class_bookings where class_id = p_class_id and member_id = p_member_id;
  if v_existing.id is not null and v_existing.status <> 'cancelled' then
    raise exception 'El socio ya tiene una reserva en esta clase';
  end if;

  select count(*) into v_taken from public.class_bookings where class_id = p_class_id and status <> 'cancelled';
  if v_taken >= v_class.capacity then
    raise exception 'Aforo completo (% / %)', v_taken, v_class.capacity;
  end if;

  select * into v_settings from public.business_settings where id = 1;
  v_class_day := (v_class.starts_at at time zone v_settings.timezone)::date;

  -- Membresía que cubre el día de la clase; se prefiere la de acceso libre antes que gastar créditos
  select * into v_ms from public.memberships
  where member_id = p_member_id
    and status = 'active'
    and start_date <= v_class_day
    and end_date + v_settings.tolerance_days >= v_class_day
    and (class_credits_left is null or class_credits_left > 0)
  order by (class_credits_left is not null), end_date
  limit 1
  for update;

  if v_ms.id is null then
    if exists (select 1 from public.memberships
               where member_id = p_member_id and status = 'active'
                 and start_date <= v_class_day and end_date + v_settings.tolerance_days >= v_class_day
                 and class_credits_left = 0) then
      raise exception 'El socio no tiene clases disponibles en su paquete';
    end if;
    raise exception 'El socio no tiene una membresía vigente para la fecha de la clase';
  end if;

  if v_ms.class_credits_left is not null then
    update public.memberships set class_credits_left = class_credits_left - 1 where id = v_ms.id;
  end if;

  insert into public.class_bookings (class_id, member_id, membership_id)
  values (p_class_id, p_member_id, v_ms.id)
  on conflict (class_id, member_id) do update
    set status = 'booked', membership_id = excluded.membership_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Mismo comportamiento que en 0003: permiso del personal + núcleo compartido
create or replace function public.book_class(p_class_id uuid, p_member_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('routines', 'create') or public.has_permission('checkin', 'create')) then
    raise exception 'No tienes permiso para reservar clases' using errcode = '42501';
  end if;
  return public._book_class_core(p_class_id, p_member_id);
end;
$$;

create or replace function public._portal_member_id(p_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where p_token is not null and length(p_token) between 32 and 64 and portal_token = p_token;
$$;

-- Todo lo que ve el socio en su portal, en una sola llamada. null = token inválido o revocado.
create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_member public.members%rowtype;
  v_settings public.business_settings%rowtype;
  v_today date := public.business_today();
begin
  select * into v_member from public.members where id = public._portal_member_id(p_token);
  if v_member.id is null then
    return null;
  end if;
  select * into v_settings from public.business_settings where id = 1;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_settings.name, 'logo_path', v_settings.logo_path, 'phone', v_settings.phone,
      'address', v_settings.address, 'currency', v_settings.currency, 'opening_hours', v_settings.opening_hours,
      'timezone', v_settings.timezone),
    'member', jsonb_build_object(
      'first_name', v_member.first_name, 'last_name', v_member.last_name,
      'status', v_member.status, 'qr_token', v_member.qr_token),
    -- Membresía vigente o la próxima por empezar
    'membership', (
      select jsonb_build_object('plan', p.name, 'start_date', ms.start_date, 'end_date', ms.end_date,
                                'status', ms.status, 'class_credits_left', ms.class_credits_left)
      from public.memberships ms join public.plans p on p.id = ms.plan_id
      where ms.member_id = v_member.id and ms.status in ('active', 'frozen')
        and ms.end_date + v_settings.tolerance_days >= v_today
      order by ms.start_date
      limit 1),
    'last_end_date', (
      select max(end_date) from public.memberships
      where member_id = v_member.id and status <> 'cancelled'),
    'debt', (
      select coalesce(sum(price - amount_paid), 0) from public.memberships
      where member_id = v_member.id and status <> 'cancelled'),
    'visits_30d', (
      select count(*) from public.attendance
      where member_id = v_member.id and result <> 'denied' and checked_in_at >= now() - interval '30 days'),
    'routines', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'goal', r.goal, 'exercises', r.exercises,
                                          'trainer', pr.full_name, 'start_date', r.start_date)
                       order by r.created_at desc)
      from public.routines r left join public.profiles pr on pr.id = r.trainer_id
      where r.member_id = v_member.id and r.active), '[]'::jsonb),
    -- Clases de los próximos 14 días con cupos y la reserva del socio (si tiene)
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'discipline', c.discipline, 'starts_at', c.starts_at,
               'duration_min', c.duration_min, 'capacity', c.capacity, 'location', c.location,
               'trainer', pr.full_name,
               'taken', (select count(*) from public.class_bookings b
                         where b.class_id = c.id and b.status <> 'cancelled'),
               'booking_id', mb.id, 'booking_status', mb.status)
             order by c.starts_at)
      from public.group_classes c
      left join public.profiles pr on pr.id = c.trainer_id
      left join public.class_bookings mb on mb.class_id = c.id and mb.member_id = v_member.id
      where c.starts_at + make_interval(mins => c.duration_min) > now()
        and c.starts_at < now() + interval '14 days'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.portal_book_class(p_token text, p_class_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid := public._portal_member_id(p_token);
begin
  if v_member_id is null then
    raise exception 'Enlace no válido. Pide uno nuevo en recepción.' using errcode = '42501';
  end if;
  return public._book_class_core(p_class_id, v_member_id);
end;
$$;

-- El socio solo cancela sus reservas activas de clases que aún no empiezan; devuelve el crédito
create or replace function public.portal_cancel_booking(p_token text, p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid := public._portal_member_id(p_token);
  v_booking public.class_bookings%rowtype;
  v_starts timestamptz;
begin
  if v_member_id is null then
    raise exception 'Enlace no válido. Pide uno nuevo en recepción.' using errcode = '42501';
  end if;
  select * into v_booking from public.class_bookings
  where id = p_booking_id and member_id = v_member_id for update;
  if v_booking.id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'Esta reserva ya no está activa';
  end if;
  select starts_at into v_starts from public.group_classes where id = v_booking.class_id;
  if v_starts <= now() then
    raise exception 'La clase ya empezó: no se puede cancelar';
  end if;

  update public.class_bookings set status = 'cancelled' where id = v_booking.id;
  if v_booking.membership_id is not null then
    update public.memberships set class_credits_left = class_credits_left + 1
    where id = v_booking.membership_id and class_credits_left is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. PROSPECTOS (LEADS)
--    Permisos: los mismos del módulo Socios.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (length(full_name) between 2 and 120),
  phone          text check (phone is null or length(phone) <= 20),
  email          text check (email is null or length(email) <= 160),
  source         text not null default 'walk_in'
                 check (source in ('walk_in','whatsapp','instagram','facebook','tiktok','referral','web','other')),
  interest       text check (interest is null or length(interest) <= 120),
  status         text not null default 'new' check (status in ('new','contacted','trial','won','lost')),
  next_follow_up date,
  trial_date     date,
  notes          text check (notes is null or length(notes) <= 1000),
  lost_reason    text check (lost_reason is null or length(lost_reason) <= 200),
  member_id      uuid references public.members(id) on delete set null,
  assigned_to    uuid references public.profiles(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads(status, next_follow_up);
create index if not exists leads_created_idx on public.leads(created_at desc);
create index if not exists leads_member_idx on public.leads(member_id);
create index if not exists leads_assigned_idx on public.leads(assigned_to);
create index if not exists leads_created_by_idx on public.leads(created_by);

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;
create policy leads_select on public.leads for select to authenticated using (public.has_permission('members','read'));
create policy leads_insert on public.leads for insert to authenticated with check (public.has_permission('members','create'));
create policy leads_update on public.leads for update to authenticated
  using (public.has_permission('members','update')) with check (public.has_permission('members','update'));
create policy leads_delete on public.leads for delete to authenticated using (public.has_permission('members','delete'));

-- Convierte un prospecto en socio de forma atómica. SECURITY INVOKER: aplica el RLS del usuario
-- (crear socios y editar prospectos). Los datos llegan validados por la Server Action (Zod).
create or replace function public.convert_lead(p_lead_id uuid, p_member jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_lead public.leads%rowtype;
  v_member_id uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    raise exception 'Prospecto no encontrado';
  end if;
  if v_lead.member_id is not null then
    raise exception 'Este prospecto ya fue registrado como socio';
  end if;

  insert into public.members (dni, first_name, last_name, email, phone, birth_date, gender,
                              medical_notes, emergency_contact, trainer_id)
  values (p_member->>'dni', p_member->>'first_name', p_member->>'last_name',
          nullif(p_member->>'email', ''), nullif(p_member->>'phone', ''),
          nullif(p_member->>'birth_date', '')::date, nullif(p_member->>'gender', ''),
          nullif(p_member->>'medical_notes', ''), nullif(p_member->>'emergency_contact', ''),
          nullif(p_member->>'trainer_id', '')::uuid)
  returning id into v_member_id;

  update public.leads set status = 'won', member_id = v_member_id, next_follow_up = null where id = p_lead_id;
  return v_member_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. RETENCIÓN
--    Socios inactivos, cumpleaños y vencidos recientes, con el último contacto registrado.
-- ---------------------------------------------------------------------
create table if not exists public.retention_contacts (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  reason     text not null check (reason in ('inactive','birthday','lapsed')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists retention_contacts_member_idx
  on public.retention_contacts(member_id, reason, created_at desc);
create index if not exists retention_contacts_created_by_idx on public.retention_contacts(created_by);

alter table public.retention_contacts enable row level security;
drop policy if exists retention_contacts_select on public.retention_contacts;
drop policy if exists retention_contacts_insert on public.retention_contacts;
create policy retention_contacts_select on public.retention_contacts for select to authenticated
  using (public.has_permission('members','read'));
create policy retention_contacts_insert on public.retention_contacts for insert to authenticated
  with check (public.has_permission('members','read') and created_by = auth.uid());

create or replace function public.retention_overview(p_inactive_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tz text := (select timezone from public.business_settings where id = 1);
  v_tol integer := (select tolerance_days from public.business_settings where id = 1);
  v_days integer := least(greatest(coalesce(p_inactive_days, 14), 3), 180);
begin
  perform public.assert_permission('members', 'read');

  return jsonb_build_object(
    'inactive_days', v_days,
    -- Con membresía vigente, socios desde hace más de N días, que no vienen hace N días o más
    'inactive', coalesce((
      select jsonb_agg(row_to_json(x) order by x.last_visit nulls first)
      from (
        select m.id, m.first_name, m.last_name, m.phone, lv.at as last_visit,
               case when lv.at is null then null else v_today - (lv.at at time zone v_tz)::date end as days_since,
               cm.end_date, cm.plan_name,
               (select max(rc.created_at) from public.retention_contacts rc
                where rc.member_id = m.id and rc.reason = 'inactive') as last_contact_at
        from public.members m
        join lateral (
          select ms.end_date, p.name as plan_name from public.memberships ms
          join public.plans p on p.id = ms.plan_id
          where ms.member_id = m.id and ms.status = 'active'
            and ms.start_date <= v_today and ms.end_date + v_tol >= v_today
          order by ms.end_date desc limit 1) cm on true
        left join lateral (
          select max(a.checked_in_at) as at from public.attendance a
          where a.member_id = m.id and a.result <> 'denied') lv on true
        where m.status = 'active'
          and (lv.at is null or lv.at < now() - make_interval(days => v_days))
          and (select min(ms2.start_date) from public.memberships ms2
               where ms2.member_id = m.id and ms2.status <> 'cancelled') <= v_today - v_days
        order by lv.at nulls first
        limit 200) x), '[]'::jsonb),
    -- Cumpleaños de hoy a 7 días
    'birthdays', coalesce((
      select jsonb_agg(row_to_json(x) order by x.days_until, x.last_name)
      from (
        select m.id, m.first_name, m.last_name, m.phone, m.birth_date, m.status, d.n as days_until,
               (select max(rc.created_at) from public.retention_contacts rc
                where rc.member_id = m.id and rc.reason = 'birthday') as last_contact_at
        from public.members m
        join generate_series(0, 7) as d(n)
          on to_char(m.birth_date, 'MM-DD') = to_char(v_today + d.n, 'MM-DD')
        where m.birth_date is not null
        order by d.n, m.last_name
        limit 200) x), '[]'::jsonb),
    -- Vencidos en los últimos 30 días que no renovaron
    'lapsed', coalesce((
      select jsonb_agg(row_to_json(x) order by x.end_date desc)
      from (
        select m.id, m.first_name, m.last_name, m.phone, lm.end_date, lm.plan_name,
               v_today - lm.end_date as days_since,
               (select max(rc.created_at) from public.retention_contacts rc
                where rc.member_id = m.id and rc.reason = 'lapsed') as last_contact_at
        from public.members m
        join lateral (
          select ms.end_date, p.name as plan_name from public.memberships ms
          join public.plans p on p.id = ms.plan_id
          where ms.member_id = m.id and ms.status <> 'cancelled'
          order by ms.end_date desc limit 1) lm on true
        where m.status = 'expired'
          and lm.end_date between v_today - 30 and v_today - 1
        order by lm.end_date desc
        limit 200) x), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. PERMISOS DE EJECUCIÓN
--    Supabase concede EXECUTE a anon en funciones nuevas: se restringe explícitamente.
-- ---------------------------------------------------------------------
revoke execute on function public._book_class_core(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._portal_member_id(text) from public, anon, authenticated;

revoke execute on function public.book_class(uuid, uuid) from public, anon;
grant execute on function public.book_class(uuid, uuid) to authenticated, service_role;

-- Portal: lo usa el socio sin sesión (anon); la seguridad la da el token secreto
revoke execute on function public.portal_get(text) from public;
revoke execute on function public.portal_book_class(text, uuid) from public;
revoke execute on function public.portal_cancel_booking(text, uuid) from public;
grant execute on function public.portal_get(text) to anon, authenticated, service_role;
grant execute on function public.portal_book_class(text, uuid) to anon, authenticated, service_role;
grant execute on function public.portal_cancel_booking(text, uuid) to anon, authenticated, service_role;

revoke execute on function public.convert_lead(uuid, jsonb) from public, anon;
grant execute on function public.convert_lead(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.retention_overview(integer) from public, anon;
grant execute on function public.retention_overview(integer) to authenticated, service_role;

-- Tablas nuevas: sin acceso para anon (RLS ya lo impide; esto es una segunda barrera)
revoke all on public.leads from anon;
revoke all on public.retention_contacts from anon;
