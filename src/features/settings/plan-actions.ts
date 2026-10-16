'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { planSchema, zodFieldErrors } from '@/lib/validations';
import type { ActionResult } from '@/types/database';

export async function savePlan(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('settings', 'update');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };
  if (parsed.data.kind === 'class_pack' && !parsed.data.class_credits) {
    return { ok: false, error: 'Un paquete de clases necesita la cantidad de clases', fieldErrors: { class_credits: ['Requerido'] } };
  }

  const supabase = await getSupabaseServer();
  if (id === null) {
    const { error } = await supabase.from('plans').insert(parsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  } else {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) return { ok: false, error: 'Plan inválido' };
    const { error } = await supabase.from('plans').update(parsed.data).eq('id', idParsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  }
  revalidatePath('/plans');
  return { ok: true, data: undefined, message: 'Plan guardado' };
}

export async function deletePlan(id: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('settings', 'delete');
  if (auth.error) return { ok: false, error: auth.error };
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Plan inválido' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('plans').delete().eq('id', idParsed.data);
  if (error) {
    if (error.code === '23503') {
      const { error: e2 } = await supabase.from('plans').update({ active: false }).eq('id', idParsed.data);
      if (e2) return { ok: false, error: humanizeError(e2) };
      revalidatePath('/plans');
      return { ok: true, data: undefined, message: 'El plan tiene membresías: se desactivó en lugar de eliminarse' };
    }
    return { ok: false, error: humanizeError(error) };
  }
  revalidatePath('/plans');
  return { ok: true, data: undefined, message: 'Plan eliminado' };
}
