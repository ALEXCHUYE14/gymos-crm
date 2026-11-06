'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { leadSchema, memberSchema, zodFieldErrors } from '@/lib/validations';
import type { ActionResult } from '@/types/database';

const uuid = z.string().uuid();

export async function saveLead(id: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction('members', id === null ? 'create' : 'update');
  if (auth.error) return { ok: false, error: auth.error };

  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos marcados', fieldErrors: zodFieldErrors(parsed.error) };
  // El motivo de pérdida solo tiene sentido en prospectos perdidos
  const values = { ...parsed.data, lost_reason: parsed.data.status === 'lost' ? parsed.data.lost_reason : null };

  const supabase = await getSupabaseServer();
  if (id === null) {
    const { data, error } = await supabase.from('leads').insert(values).select('id').single();
    if (error) return { ok: false, error: humanizeError(error) };
    revalidatePath('/leads');
    return { ok: true, data: { id: data.id as string }, message: 'Prospecto registrado' };
  }

  const idParsed = uuid.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Prospecto inválido' };
  // Un prospecto ya registrado como socio no se edita (conserva el vínculo con el socio)
  const { data, error } = await supabase
    .from('leads')
    .update(values)
    .eq('id', idParsed.data)
    .is('member_id', null)
    .select('id');
  if (error) return { ok: false, error: humanizeError(error) };
  if (!data?.length) return { ok: false, error: 'El prospecto ya es socio o fue eliminado' };

  revalidatePath('/leads');
  return { ok: true, data: { id: idParsed.data }, message: 'Prospecto actualizado' };
}

export async function deleteLead(id: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('members', 'delete');
  if (auth.error) return { ok: false, error: auth.error };
  const idParsed = uuid.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Prospecto inválido' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('leads').delete().eq('id', idParsed.data);
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/leads');
  return { ok: true, data: undefined, message: 'Prospecto eliminado' };
}

/** Registra al prospecto como socio y lo marca como ganado, en una sola transacción (RPC convert_lead). */
export async function convertLead(id: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction('members', 'create');
  if (auth.error) return { ok: false, error: auth.error };

  const idParsed = uuid.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Prospecto inválido' };
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos marcados', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('convert_lead', { p_lead_id: idParsed.data, p_member: parsed.data });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/leads');
  revalidatePath('/members');
  return { ok: true, data: { id: data as string }, message: 'Prospecto registrado como socio' };
}
