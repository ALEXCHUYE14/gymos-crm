-- =====================================================================
-- GymOS · Correcciones sobre 0001 (seguro de ejecutar más de una vez)
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- =====================================================================

-- 1. No permitir abonos a membresías anuladas.
--    Antes se podía cobrar (y registrar en caja) un abono a una membresía cancelada,
--    aunque su saldo ya no cuenta como deuda.
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
  if v_ms.status = 'cancelled' then
    raise exception 'La membresía está anulada: no admite abonos';
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

-- 2. Funciones internas que no deben llamarse por RPC.
--    Son security definer: cualquier usuario autenticado podía consultar el estado de
--    membresía de cualquier socio (member_computed_status) o forzar su recálculo
--    (refresh_member_status) aunque RLS no le dejara ver al socio.
--    Los triggers y expire_memberships() las siguen usando (corren como dueño).
revoke execute on function public.member_computed_status(uuid) from authenticated, anon, public;
revoke execute on function public.refresh_member_status(uuid) from authenticated, anon, public;
