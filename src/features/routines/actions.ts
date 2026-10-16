'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction, hasPermission, getSessionContext } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { groupClassSchema, routineSchema, zodFieldErrors } from '@/lib/validations';
import type { ActionResult } from '@/types/database';

const uuid = z.string().uuid();

export async function saveRoutine(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('routines', id === null ? 'create' : 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = routineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa la rutina', fieldErrors: zodFieldErrors(parsed.error) };
  if (parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) {
    return { ok: false, error: 'La fecha de fin debe ser posterior al inicio' };
  }

  const supabase = await getSupabaseServer();
  if (id === null) {
    const { error } = await supabase.from('routines').insert({ ...parsed.data, trainer_id: auth.ctx.userId });
    if (error) return { ok: false, error: humanizeError(error) };
  } else {
    const idParsed = uuid.safeParse(id);
    if (!idParsed.success) return { ok: false, error: 'Rutina inválida' };
    const { error } = await supabase.from('routines').update(parsed.data).eq('id', idParsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  }
  revalidatePath('/routines');
  revalidatePath(`/members/${parsed.data.member_id}`);
  return { ok: true, data: undefined, message: 'Rutina guardada' };
}

export async function setRoutineActive(id: unknown, active: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('routines', 'update');
  if (auth.error) return { ok: false, error: auth.error };
  const parsed = z.object({ id: uuid, active: z.boolean() }).safeParse({ id, active });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('routines').update({ active: parsed.data.active }).eq('id', parsed.data.id);
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/routines');
  return { ok: true, data: undefined, message: parsed.data.active ? 'Rutina reactivada' : 'Rutina finalizada' };
}

export async function deleteRoutine(id: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('routines', 'delete');
  if (auth.error) return { ok: false, error: auth.error };
  const idParsed = uuid.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Rutina inválida' };
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('routines').delete().eq('id', idParsed.data);
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/routines');
  return { ok: true, data: undefined, message: 'Rutina eliminada' };
}

export async function saveClass(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('routines', id === null ? 'create' : 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = groupClassSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa la clase', fieldErrors: zodFieldErrors(parsed.error) };

  // datetime-local llega sin zona: se interpreta en la zona horaria del negocio
  const tz = auth.ctx.settings.timezone;
  const startsAt = zonedLocalToUtcIso(parsed.data.starts_at, tz);
  if (!startsAt) return { ok: false, error: 'Fecha y hora inválidas' };

  const payload = { ...parsed.data, starts_at: startsAt };
  const supabase = await getSupabaseServer();
  if (id === null) {
    const { error } = await supabase.from('group_classes').insert(payload);
    if (error) return { ok: false, error: humanizeError(error) };
  } else {
    const idParsed = uuid.safeParse(id);
    if (!idParsed.success) return { ok: false, error: 'Clase inválida' };
    const { error } = await supabase.from('group_classes').update(payload).eq('id', idParsed.data);
    if (error) return { ok: false, error: humanizeError(error) };
  }
  revalidatePath('/routines');
  return { ok: true, data: undefined, message: 'Clase programada' };
}

export async function deleteClass(id: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('routines', 'delete');
  if (auth.error) return { ok: false, error: auth.error };
  const idParsed = uuid.safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'Clase inválida' };
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('group_classes').delete().eq('id', idParsed.data);
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/routines');
  return { ok: true, data: undefined, message: 'Clase eliminada' };
}

export async function bookClass(classId: unknown, memberId: unknown): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx || !(hasPermission(ctx, 'routines', 'create') || hasPermission(ctx, 'checkin', 'create'))) {
    return { ok: false, error: 'No tienes permiso para reservar clases' };
  }
  const parsed = z.object({ classId: uuid, memberId: uuid }).safeParse({ classId, memberId });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('book_class', { p_class_id: parsed.data.classId, p_member_id: parsed.data.memberId });
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/routines');
  return { ok: true, data: undefined, message: 'Reserva confirmada' };
}

export async function setBookingStatus(bookingId: unknown, status: unknown): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx || !(hasPermission(ctx, 'routines', 'update') || hasPermission(ctx, 'checkin', 'create'))) {
    return { ok: false, error: 'No tienes permiso' };
  }
  const parsed = z.object({ bookingId: uuid, status: z.enum(['booked', 'attended', 'cancelled']) }).safeParse({ bookingId, status });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_booking_status', { p_booking_id: parsed.data.bookingId, p_status: parsed.data.status });
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/routines');
  return { ok: true, data: undefined };
}

/** Convierte "YYYY-MM-DDTHH:mm" (hora local del negocio) a ISO UTC. */
function zonedLocalToUtcIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(asUtc)).map((p) => [p.type, p.value]));
  const zonedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const offset = zonedAsUtc - asUtc;
  return new Date(asUtc - offset).toISOString();
}
