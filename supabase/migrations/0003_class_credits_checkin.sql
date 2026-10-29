-- =====================================================================
-- GymOS · Créditos de clases, reservas con membresía vigente y anti doble lectura
-- Requiere 0001. Seguro de ejecutar más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUMNAS
-- ---------------------------------------------------------------------
-- null = sin límite de clases (planes de acceso libre)
alter table public.memberships
  add column if not exists class_credits_left integer
  check (class_credits_left is null or class_credits_left >= 0);

-- Membresía a la que se cargó la reserva (para devolver el crédito al cancelar)
alter table public.class_bookings
  add column if not exists membership_id uuid references public.memberships(id) on delete set null;

-- Paquetes de clases vigentes vendidos antes de esta migración: arrancan con los créditos del plan
update public.memberships ms
set class_credits_left = p.class_credits
from public.plans p
where p.id = ms.plan_id
  and p.class_credits is not null
  and ms.class_credits_left is null
  and ms.status in ('active', 'frozen');

-- ---------------------------------------------------------------------
-- 2. VENTA DE MEMBRESÍA: guarda los créditos del plan
-- ---------------------------------------------------------------------
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

  insert into public.memberships (member_id, plan_id, start_date, end_date, price, amount_paid, status, sale_id, class_credits_left)
  values (p_member_id, v_plan.id, v_start, v_end, v_plan.price, round(p_amount_paid, 2), 'active', v_sale_id, v_plan.class_credits)
  returning id into v_ms_id;

  return jsonb_build_object('membership_id', v_ms_id, 'sale_id', v_sale_id,
                            'start_date', v_start, 'end_date', v_end,
                            'debt', v_plan.price - round(p_amount_paid, 2));
end;
$$;

-- ---------------------------------------------------------------------
-- 3. RESERVAS: exigen membresía vigente y descuentan créditos
-- ---------------------------------------------------------------------
create or replace function public.book_class(p_class_id uuid, p_member_id uuid)
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
  if not (public.has_permission('routines', 'create') or public.has_permission('checkin', 'create')) then
    raise exception 'No tienes permiso para reservar clases' using errcode = '42501';
  end if;
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

-- Solo se marca asistencia o se cancela una reserva activa; cancelar devuelve el crédito
create or replace function public.set_booking_status(p_booking_id uuid, p_status public.booking_status)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.class_bookings%rowtype;
begin
  if not (public.has_permission('routines', 'update') or public.has_permission('checkin', 'create')) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  select * into v_booking from public.class_bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_booking.status = p_status then
    return;
  end if;
  if v_booking.status <> 'booked' or p_status = 'booked' then
    raise exception 'Solo se puede marcar asistencia o cancelar una reserva activa';
  end if;

  update public.class_bookings set status = p_status where id = v_booking.id;

  if p_status = 'cancelled' and v_booking.membership_id is not null then
    update public.memberships set class_credits_left = class_credits_left + 1
    where id = v_booking.membership_id and class_credits_left is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. CHECK-IN: anti doble lectura y control de paquetes de clases
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
  v_last_entry timestamptz;
  v_repeat boolean := false;
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

  -- Preferir: activa y vigente > con clases disponibles > la que vence más tarde
  select * into v_ms from public.memberships
  where member_id = v_member.id and status in ('active','frozen') and start_date <= v_today
  order by (status = 'active' and end_date + v_settings.tolerance_days >= v_today) desc,
           (class_credits_left is null or class_credits_left > 0) desc,
           end_date desc
  limit 1;

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

    -- Paquete agotado: solo entra si tiene una clase reservada hoy
    if v_result <> 'denied' and v_ms.class_credits_left = 0
       and not exists (
         select 1 from public.class_bookings b
         join public.group_classes c on c.id = b.class_id
         where b.member_id = v_member.id and b.status <> 'cancelled'
           and (c.starts_at at time zone v_settings.timezone)::date = v_today) then
      v_result := 'denied'; v_reason := 'Sin clases disponibles en su paquete';
    end if;
  end if;

  if v_ms.id is not null then
    select name into v_plan_name from public.plans where id = v_ms.plan_id;
  end if;

  -- Anti doble lectura: si ya ingresó en los últimos 30 min, no se registra otra asistencia
  if v_result <> 'denied' then
    select checked_in_at into v_last_entry from public.attendance
    where member_id = v_member.id and result <> 'denied' and checked_in_at > now() - interval '30 minutes'
    order by checked_in_at desc limit 1;
    v_repeat := v_last_entry is not null;
  end if;

  if v_repeat then
    v_reason := v_reason || ' · Ingreso ya registrado a las '
                || to_char(v_last_entry at time zone v_settings.timezone, 'HH24:MI');
  else
    insert into public.attendance (member_id, membership_id, result, reason)
    values (v_member.id, v_ms.id, v_result, v_reason);
  end if;

  return jsonb_build_object(
    'result', v_result,
    'reason', v_reason,
    'repeat', v_repeat,
    'member_id', v_member.id,
    'full_name', v_member.first_name || ' ' || v_member.last_name,
    'dni', v_member.dni,
    'photo_path', v_member.photo_path,
    'medical_notes', v_member.medical_notes,
    'plan_name', v_plan_name,
    'end_date', v_ms.end_date,
    'days_left', case when v_ms.id is null then null else v_ms.end_date - v_today end,
    'class_credits_left', v_ms.class_credits_left,
    'debt', v_debt
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. DASHBOARD: asistencias de hoy = socios distintos que ingresaron
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
    'checkins_today',  (select count(distinct member_id) from public.attendance
                        where (checked_in_at at time zone v_tz)::date = v_today and result <> 'denied'),
    'revenue_today',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where (created_at at time zone v_tz)::date = v_today) end,
    'revenue_month',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where date_trunc('month', created_at at time zone v_tz) = date_trunc('month', v_today::timestamp)) end
  );
end;
$$;
