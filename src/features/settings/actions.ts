'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  businessRulesSchema,
  businessSettingsSchema,
  notificationSettingsSchema,
  zodFieldErrors,
} from '@/lib/validations';
import type { ActionResult, BusinessSettings } from '@/types/database';

async function persist(patch: Record<string, unknown>): Promise<ActionResult<BusinessSettings>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('business_settings').update(patch).eq('id', 1).select('*').single();
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/', 'layout');
  return { ok: true, data: data as BusinessSettings, message: 'Ajustes guardados' };
}

export async function saveBusinessInfo(input: unknown): Promise<ActionResult<BusinessSettings>> {
  const auth = await authorizeAction('settings', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = businessSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };
  try {
    new Intl.DateTimeFormat('es', { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, error: 'Zona horaria inválida', fieldErrors: { timezone: ['Usa un identificador IANA, p. ej. America/Lima'] } };
  }
  return persist(parsed.data);
}

export async function saveBusinessRules(input: unknown): Promise<ActionResult<BusinessSettings>> {
  const auth = await authorizeAction('settings', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = businessRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };
  return persist(parsed.data);
}

export async function saveNotificationSettings(input: unknown): Promise<ActionResult<BusinessSettings>> {
  const auth = await authorizeAction('settings', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = notificationSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };
  if (parsed.data.notifications_enabled && !parsed.data.whatsapp_webhook_url && !parsed.data.email_webhook_url) {
    return { ok: false, error: 'Configura al menos un webhook para activar los recordatorios' };
  }
  return persist(parsed.data);
}

const brandingSchema = z.object({
  kind: z.enum(['logo', 'payment_qr']),
  path: z
    .string()
    .regex(/^(logo|payment_qr)\/[\w.-]+$/)
    .nullable(),
});

export async function setBrandingAsset(input: unknown): Promise<ActionResult<BusinessSettings>> {
  const auth = await authorizeAction('settings', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Archivo inválido' };
  if (parsed.data.path && !parsed.data.path.startsWith(`${parsed.data.kind}/`)) return { ok: false, error: 'Ruta inválida' };

  const column = parsed.data.kind === 'logo' ? 'logo_path' : 'payment_qr_path';
  const previous = auth.ctx.settings[column];
  const result = await persist({ [column]: parsed.data.path });
  if (result.ok && previous && previous !== parsed.data.path) {
    const supabase = await getSupabaseServer();
    await supabase.storage.from('branding').remove([previous]);
  }
  return result;
}
