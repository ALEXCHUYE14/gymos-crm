'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { memberSchema, zodFieldErrors } from '@/lib/validations';
import type { ActionResult } from '@/types/database';

export async function createMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction('members', 'create');
  if (auth.error) return { ok: false, error: auth.error };

  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos marcados', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('members').insert(parsed.data).select('id').single();
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/members');
  return { ok: true, data: { id: data.id as string }, message: 'Socio registrado' };
}

export async function updateMember(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('members', 'update');
  if (auth.error) return { ok: false, error: auth.error };

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Identificador inválido' };
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos marcados', fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('members').update(parsed.data).eq('id', idParsed.data);
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath(`/members/${idParsed.data}`);
  revalidatePath('/members');
  return { ok: true, data: undefined, message: 'Datos actualizados' };
}

export async function deleteMembers(ids: unknown): Promise<ActionResult<{ count: number }>> {
  const auth = await authorizeAction('members', 'delete');
  if (auth.error) return { ok: false, error: auth.error };

  const parsed = z.array(z.string().uuid()).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: 'Selección inválida' };

  const supabase = await getSupabaseServer();
  const { error, count } = await supabase.from('members').delete({ count: 'exact' }).in('id', parsed.data);
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/members');
  return { ok: true, data: { count: count ?? 0 }, message: `${count ?? 0} socio(s) eliminado(s)` };
}

export async function setMemberPhoto(id: unknown, path: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('members', 'update');
  if (auth.error) return { ok: false, error: auth.error };

  const parsed = z
    .object({ id: z.string().uuid(), path: z.string().regex(/^[0-9a-f-]{36}\/[\w.-]+$/) })
    .safeParse({ id, path });
  if (!parsed.success || !parsed.data.path.startsWith(`${parsed.data.id}/`)) {
    return { ok: false, error: 'Ruta de imagen inválida' };
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('members').update({ photo_path: parsed.data.path }).eq('id', parsed.data.id);
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath(`/members/${parsed.data.id}`);
  return { ok: true, data: undefined, message: 'Foto actualizada' };
}

const membershipActionSchema = z.object({
  membership_id: z.string().uuid(),
  action: z.enum(['freeze', 'unfreeze', 'cancel']),
});

export async function changeMembershipState(input: unknown): Promise<ActionResult> {
  const parsed = membershipActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };

  const auth = await authorizeAction('members', parsed.data.action === 'cancel' ? 'delete' : 'update');
  if (auth.error) return { ok: false, error: auth.error };

  const fn = { freeze: 'freeze_membership', unfreeze: 'unfreeze_membership', cancel: 'cancel_membership' }[parsed.data.action];
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc(fn, { p_membership_id: parsed.data.membership_id });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/members', 'layout');
  const messages = { freeze: 'Membresía congelada', unfreeze: 'Membresía reactivada', cancel: 'Membresía anulada' };
  return { ok: true, data: undefined, message: messages[parsed.data.action] };
}
