'use server';

import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import { getSupabaseAnon } from '@/lib/supabase/anon';
import type { ActionResult } from '@/types/database';

// Mismo formato que exige la base de datos (members.portal_token)
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
const inputSchema = z.object({ token: tokenSchema, id: z.string().uuid() });

/** Los mensajes de la base están pensados para el personal; en el portal se le habla al socio. */
const MEMBER_MESSAGES: Array<[string, string]> = [
  ['ya tiene una reserva', 'Ya tienes una reserva en esta clase.'],
  ['no tiene clases disponibles', 'Ya usaste todas las clases de tu paquete. Renuévalo en recepción.'],
  ['no tiene una membresía vigente', 'Necesitas una membresía vigente para la fecha de esta clase.'],
  ['Aforo completo', 'La clase se llenó. Elige otro horario.'],
  ['ya finalizó', 'Esta clase ya terminó.'],
];

function memberMessage(error: unknown) {
  const text = humanizeError(error);
  return MEMBER_MESSAGES.find(([needle]) => text.includes(needle))?.[1] ?? text;
}

export async function bookPortalClass(token: unknown, classId: unknown): Promise<ActionResult> {
  const parsed = inputSchema.safeParse({ token, id: classId });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  const { error } = await getSupabaseAnon().rpc('portal_book_class', { p_token: parsed.data.token, p_class_id: parsed.data.id });
  if (error) return { ok: false, error: memberMessage(error) };
  return { ok: true, data: undefined, message: 'Reserva confirmada' };
}

export async function cancelPortalBooking(token: unknown, bookingId: unknown): Promise<ActionResult> {
  const parsed = inputSchema.safeParse({ token, id: bookingId });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  const { error } = await getSupabaseAnon().rpc('portal_cancel_booking', { p_token: parsed.data.token, p_booking_id: parsed.data.id });
  if (error) return { ok: false, error: memberMessage(error) };
  return { ok: true, data: undefined, message: 'Reserva cancelada' };
}
