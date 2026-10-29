-- =====================================================================
-- GymOS · Rendimiento y escala (miles de socios / cientos de miles de asistencias)
-- Requiere 0001 y 0003. Seguro de ejecutar más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONTEXTO DE SESIÓN EN UNA SOLA LLAMADA
--    Antes: perfil + permisos + ajustes = 3 peticiones por navegación, y los permisos
--    evaluaban has_permission() 40 veces (~120 consultas). Ahora: 1 petición, set-based.
-- ---------------------------------------------------------------------
create or replace function public.get_session_context()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (
    select p.*, r.id as r_id, r.key as r_key, r.name as r_name
    from public.profiles p
    left join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
  ),
  perms as (
    -- Misma lógica que has_permission(): super_admin todo; si no, excepción del usuario y luego su rol
    select pe.module, pe.action
    from public.permissions pe, me
    where me.active
      and (me.r_key = 'super_admin'
           or coalesce(
                (select o.granted from public.user_permission_overrides o
                 where o.user_id = me.id and o.permission_id = pe.id),
                exists (select 1 from public.role_permissions rp
                        where rp.role_id = me.role_id and rp.permission_id = pe.id)))
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'profile', (select to_jsonb(p) - 'r_id' - 'r_key' - 'r_name'
                       || jsonb_build_object('role', case when p.r_id is null then null
                          else jsonb_build_object('id', p.r_id, 'key', p.r_key, 'name', p.r_name) end)
                from me p),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object('module', module, 'action', action)) from perms), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.business_settings s where s.id = 1)
  ) end;
$$;
revoke execute on function public.get_session_context() from public, anon;
grant execute on function public.get_session_context() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RLS: evaluar los permisos UNA vez por consulta, no una vez por fila
--    `(select f())` hace que Postgres lo calcule como initPlan (recomendación oficial de Supabase).
--    Con 5000 socios, una búsqueda pasaba de ~10 000 llamadas a has_permission() a 1-2.
-- ---------------------------------------------------------------------
drop policy if exists settings_update on public.business_settings;
create policy settings_update on public.business_settings for update to authenticated
  using ((select public.has_permission('settings','update'))) with check ((select public.has_permission('settings','update')));

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all to authenticated
  using ((select public.has_permission('settings','update'))) with check ((select public.has_permission('settings','update')));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('staff','read')) or (select public.has_permission('routines','read')));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('staff','update')))
  with check (id = (select auth.uid()) or (select public.has_permission('staff','update')));

drop policy if exists overrides_select on public.user_permission_overrides;
create policy overrides_select on public.user_permission_overrides for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff','read')));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using ((select public.has_permission('members','read'))
         or (trainer_id = (select auth.uid()) and (select public.has_permission('routines','read'))));
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check ((select public.has_permission('members','create')));
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using ((select public.has_permission('members','update'))) with check ((select public.has_permission('members','update')));
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated
  using ((select public.has_permission('members','delete')));

drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans for insert to authenticated with check ((select public.has_permission('settings','update')));
drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans for update to authenticated
  using ((select public.has_permission('settings','update'))) with check ((select public.has_permission('settings','update')));
drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans for delete to authenticated using ((select public.has_permission('settings','delete')));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using ((select public.has_permission('members','read')) or (select public.has_permission('finances','read')));

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using ((select public.has_permission('checkin','read')) or (select public.has_permission('members','read')));

drop policy if exists cash_select on public.cash_register;
create policy cash_select on public.cash_register for select to authenticated
  using (opened_by = (select auth.uid()) or (select public.has_permission('finances','read')));

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using ((select public.has_permission('pos','read')));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated with check ((select public.has_permission('pos','update')));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using ((select public.has_permission('pos','update'))) with check ((select public.has_permission('pos','update')));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated using ((select public.has_permission('pos','delete')));

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using ((select public.has_permission('finances','read')) or created_by = (select auth.uid())
         or (member_id is not null and (select public.has_permission('members','read'))));

drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated using ((select public.has_permission('routines','read')));
drop policy if exists routines_insert on public.routines;
create policy routines_insert on public.routines for insert to authenticated with check ((select public.has_permission('routines','create')));
drop policy if exists routines_update on public.routines;
create policy routines_update on public.routines for update to authenticated
  using ((select public.has_permission('routines','update'))) with check ((select public.has_permission('routines','update')));
drop policy if exists routines_delete on public.routines;
create policy routines_delete on public.routines for delete to authenticated using ((select public.has_permission('routines','delete')));

drop policy if exists classes_select on public.group_classes;
create policy classes_select on public.group_classes for select to authenticated
  using ((select public.has_permission('routines','read')) or (select public.has_permission('checkin','read')));
drop policy if exists classes_insert on public.group_classes;
create policy classes_insert on public.group_classes for insert to authenticated with check ((select public.has_permission('routines','create')));
drop policy if exists classes_update on public.group_classes;
create policy classes_update on public.group_classes for update to authenticated
  using ((select public.has_permission('routines','update'))) with check ((select public.has_permission('routines','update')));
drop policy if exists classes_delete on public.group_classes;
create policy classes_delete on public.group_classes for delete to authenticated using ((select public.has_permission('routines','delete')));

drop policy if exists bookings_select on public.class_bookings;
create policy bookings_select on public.class_bookings for select to authenticated
  using ((select public.has_permission('routines','read')) or (select public.has_permission('checkin','read')));

drop policy if exists notifications_select on public.notification_log;
create policy notifications_select on public.notification_log for select to authenticated
  using ((select public.has_permission('settings','read')));

-- Storage
drop policy if exists branding_insert on storage.objects;
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (select public.has_permission('settings','update')));
drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (select public.has_permission('settings','update')));
drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (select public.has_permission('settings','update')));

drop policy if exists member_photos_read on storage.objects;
create policy member_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'member-photos'
         and ((select public.has_permission('members','read')) or (select public.has_permission('checkin','create'))
              or (select public.has_permission('routines','read'))));
drop policy if exists member_photos_insert on storage.objects;
create policy member_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos'
              and ((select public.has_permission('members','create')) or (select public.has_permission('members','update'))));
drop policy if exists member_photos_update on storage.objects;
create policy member_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and (select public.has_permission('members','update')));
drop policy if exists member_photos_delete on storage.objects;
create policy member_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and (select public.has_permission('members','update')));

-- ---------------------------------------------------------------------
-- 3. ÍNDICES
-- ---------------------------------------------------------------------
-- Búsqueda de socios con ilike '%texto%' (lista de socios, POS, reservas)
create extension if not exists pg_trgm with schema extensions;
do $$
declare
  v_schema text;
  v_col text;
begin
  -- pg_trgm puede estar ya instalado en otro esquema (p. ej. public): se usa donde esté
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  foreach v_col in array array['dni', 'first_name', 'last_name', 'phone'] loop
    execute format('create index if not exists %I on public.members using gin (%I %I.gin_trgm_ops)',
                   'members_' || v_col || '_trgm', v_col, v_schema);
  end loop;
end $$;

-- Claves foráneas sin índice: hacían lentos los borrados en cascada y algunos filtros de RLS
create index if not exists attendance_membership_idx     on public.attendance(membership_id);
create index if not exists memberships_plan_idx          on public.memberships(plan_id);
create index if not exists memberships_sale_idx          on public.memberships(sale_id);
create index if not exists sales_created_by_idx          on public.sales(created_by);
create index if not exists sale_items_product_idx        on public.sale_items(product_id);
create index if not exists sale_items_plan_idx           on public.sale_items(plan_id);
create index if not exists class_bookings_member_idx     on public.class_bookings(member_id);
create index if not exists class_bookings_membership_idx on public.class_bookings(membership_id);
create index if not exists routines_trainer_fk_idx       on public.routines(trainer_id);
create index if not exists group_classes_trainer_idx     on public.group_classes(trainer_id);

-- ---------------------------------------------------------------------
-- 4. CONSULTAS POR FECHA QUE USEN ÍNDICE
--    `(columna at time zone tz)::date = hoy` obliga a recorrer toda la tabla.
--    Se reemplaza por un rango [inicio, fin) que usa attendance_time_idx / sales_created_idx.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tz text := (select timezone from public.business_settings where id = 1);
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_can_fin boolean := public.has_permission('finances', 'read');
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  v_day_start   := v_today::timestamp at time zone v_tz;
  v_day_end     := (v_today + 1)::timestamp at time zone v_tz;
  v_month_start := date_trunc('month', v_today::timestamp) at time zone v_tz;
  v_month_end   := (date_trunc('month', v_today::timestamp) + interval '1 month') at time zone v_tz;

  return jsonb_build_object(
    'active_members',  (select count(*) from public.members where status = 'active'),
    'debtor_members',  (select count(*) from public.members where status = 'debtor'),
    'expiring_soon',   (select count(distinct member_id) from public.memberships
                        where status = 'active' and end_date between v_today and v_today + 7),
    'checkins_today',  (select count(distinct member_id) from public.attendance
                        where checked_in_at >= v_day_start and checked_in_at < v_day_end and result <> 'denied'),
    'revenue_today',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where created_at >= v_day_start and created_at < v_day_end) end,
    'revenue_month',   case when v_can_fin then (select coalesce(sum(total),0) from public.sales
                        where created_at >= v_month_start and created_at < v_month_end) end
  );
end;
$$;

-- Además: orden total (día, método, tipo) para poder paginar el resultado sin duplicar ni perder filas
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
    where s.created_at >= (p_from::timestamp at time zone v_tz)
      and s.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
    group by 1, 2, 3
    order by 1, 2, 3;
end;
$$;

-- Vencimiento diario: calcula el estado de cada socio una sola vez (antes, dos veces)
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

  update public.members m set status = c.status
  from (select id, public.member_computed_status(id) as status from public.members) c
  where c.id = m.id and m.status is distinct from c.status;
  return v_count;
end;
$$;
revoke execute on function public.expire_memberships() from public, anon, authenticated;
