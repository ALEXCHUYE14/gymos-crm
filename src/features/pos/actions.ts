'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  cartCheckoutSchema,
  closeRegisterSchema,
  openRegisterSchema,
  paymentMethodSchema,
  productSchema,
  sellMembershipSchema,
  zodFieldErrors,
} from '@/lib/validations';
import type { ActionResult, CashSummary } from '@/types/database';

export async function openRegister(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction('pos', 'create');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = openRegisterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Monto inválido', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('open_cash_register', { p_opening_amount: parsed.data.opening_amount });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/cash');
  revalidatePath('/pos');
  return { ok: true, data: { id: data as string }, message: 'Caja abierta' };
}

export async function closeRegister(registerId: unknown, input: unknown): Promise<ActionResult<CashSummary>> {
  const auth = await authorizeAction('pos', 'create');
  if (auth.error) return { ok: false, error: auth.error };
  const id = z.string().uuid().safeParse(registerId);
  const parsed = closeRegisterSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false, error: 'Datos de cierre inválidos' };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('close_cash_register', {
    p_register_id: id.data,
    p_declared_amount: parsed.data.declared_amount,
    p_notes: parsed.data.notes,
  });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/cash');
  revalidatePath('/pos');
  return { ok: true, data: data as CashSummary, message: 'Caja cerrada' };
}

export async function checkoutCart(input: unknown): Promise<ActionResult<{ sale_id: string; total: number }>> {
  const auth = await authorizeAction('pos', 'create');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = cartCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Venta inválida' };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('register_sale', {
    p_items: parsed.data.items,
    p_payment_method: parsed.data.payment_method,
    p_member_id: parsed.data.member_id,
  });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/products');
  return { ok: true, data: data as { sale_id: string; total: number }, message: 'Venta registrada' };
}

export async function sellMembership(input: unknown): Promise<ActionResult<{ end_date: string; debt: number }>> {
  const auth = await authorizeAction('pos', 'create');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = sellMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los datos del cobro', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('sell_membership', {
    p_member_id: parsed.data.member_id,
    p_plan_id: parsed.data.plan_id,
    p_payment_method: parsed.data.payment_method,
    p_amount_paid: parsed.data.amount_paid,
    p_start_date: parsed.data.start_date,
  });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath(`/members/${parsed.data.member_id}`);
  revalidatePath('/members');
  return { ok: true, data: data as { end_date: string; debt: number }, message: 'Membresía cobrada' };
}

const payDebtSchema = z.object({
  membership_id: z.string().uuid(),
  amount: z.coerce.number().positive('Debe ser mayor a 0'),
  payment_method: paymentMethodSchema,
});

export async function payMembershipDebt(input: unknown): Promise<ActionResult<{ remaining: number }>> {
  const auth = await authorizeAction('pos', 'create');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = payDebtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Pago inválido' };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('pay_membership_debt', {
    p_membership_id: parsed.data.membership_id,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.payment_method,
  });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/members', 'layout');
  return { ok: true, data: data as { remaining: number }, message: 'Abono registrado' };
}

export async function saveProduct(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('pos', 'update');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  if (id === null) {
    const { error } = await supabase.from('products').insert(parsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  } else {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) return { ok: false, error: 'Producto inválido' };
    const { error } = await supabase.from('products').update(parsed.data).eq('id', idParsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  }
  revalidatePath('/products');
  revalidatePath('/pos');
  return { ok: true, data: undefined, message: 'Producto guardado' };
}

export async function deleteProduct(id: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('pos', 'delete');
  if (auth.error) return { ok: false, error: auth.error };
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Producto inválido' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('products').delete().eq('id', idParsed.data);
  if (error) {
    // Si ya tiene ventas, se desactiva en lugar de borrar (se preserva el historial)
    const { error: deactivateError } = await supabase.from('products').update({ active: false }).eq('id', idParsed.data);
    if (deactivateError) return { ok: false, error: humanizeError(deactivateError) };
    revalidatePath('/products');
    return { ok: true, data: undefined, message: 'El producto tenía ventas: se desactivó en lugar de eliminarse' };
  }
  revalidatePath('/products');
  return { ok: true, data: undefined, message: 'Producto eliminado' };
}
