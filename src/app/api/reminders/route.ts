import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSessionContext, hasPermission } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { formatDate } from '@/lib/utils';
import type { BusinessSettings } from '@/types/database';

export const dynamic = 'force-dynamic';

interface DueRow {
  member_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  plan_name: string;
  end_date: string;
  days_left: number;
}

function validCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function render(template: string, row: DueRow) {
  return template
    .replaceAll('{nombre}', row.full_name.split(' ')[0] ?? row.full_name)
    .replaceAll('{plan}', row.plan_name)
    .replaceAll('{fecha}', formatDate(row.end_date))
    .replaceAll('{dias}', String(row.days_left));
}

async function postWebhook(url: string, payload: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return res.ok ? null : `HTTP ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : 'Error de red';
  } finally {
    clearTimeout(timeout);
  }
}

async function run(request: NextRequest) {
  // Autoriza: cron con secreto, o usuario con permiso settings.update
  if (!validCronSecret(request)) {
    const ctx = await getSessionContext();
    if (!ctx || !ctx.profile.active || !hasPermission(ctx, 'settings', 'update')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  const admin = getSupabaseAdmin();
  const { data: settingsData, error: settingsError } = await admin.from('business_settings').select('*').eq('id', 1).single();
  if (settingsError || !settingsData) return NextResponse.json({ error: 'No se pudo leer la configuración' }, { status: 500 });
  const settings = settingsData as BusinessSettings;

  if (!settings.notifications_enabled) return NextResponse.json({ sent: 0, failed: 0, skipped: 'Notificaciones desactivadas' });

  const { data, error } = await admin.rpc('members_due_for_reminder', { p_days: settings.reminder_days_before });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Evita duplicados: no reenviar a quien ya recibió recordatorio en las últimas 20 horas
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: recent } = await admin.from('notification_log').select('member_id').eq('status', 'sent').gte('created_at', since);
  const already = new Set((recent ?? []).map((r) => r.member_id as string));

  const rows = ((data ?? []) as DueRow[]).filter((r) => !already.has(r.member_id)).slice(0, 500);
  let sent = 0;
  let failed = 0;
  const logs: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const message = render(settings.reminder_template, row);
    const base = { business: settings.name, member: row.full_name, plan: row.plan_name, end_date: row.end_date, days_left: row.days_left, message };
    const targets: Array<{ channel: 'whatsapp' | 'email'; url: string; to: string }> = [];
    if (settings.whatsapp_webhook_url && row.phone) targets.push({ channel: 'whatsapp', url: settings.whatsapp_webhook_url, to: row.phone });
    if (settings.email_webhook_url && row.email) targets.push({ channel: 'email', url: settings.email_webhook_url, to: row.email });

    for (const t of targets) {
      const payload = { ...base, channel: t.channel, to: t.to };
      const err = await postWebhook(t.url, payload);
      if (err) failed += 1;
      else sent += 1;
      logs.push({ member_id: row.member_id, channel: t.channel, payload, status: err ? 'failed' : 'sent', error: err });
    }
  }

  if (logs.length) await admin.from('notification_log').insert(logs);
  return NextResponse.json({ sent, failed, candidates: rows.length });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
