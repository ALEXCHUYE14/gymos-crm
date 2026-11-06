'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/database';

const contactSchema = z.object({
  member_id: z.string().uuid(),
  reason: z.enum(['inactive', 'birthday', 'lapsed']),
});

/** Registra que se contactó al socio (para no escribirle dos veces por el mismo motivo). */
export async function logRetentionContact(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('members', 'read');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('retention_contacts')
    .insert({ ...parsed.data, created_by: auth.ctx.userId });
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/retention');
  return { ok: true, data: undefined };
}
