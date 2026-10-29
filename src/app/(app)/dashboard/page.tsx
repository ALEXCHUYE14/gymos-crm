import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, AlertCircle, CalendarClock, ScanLine, ShoppingCart, TrendingUp, UserPlus, Users } from 'lucide-react';
import { getSessionContext, hasPermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { formatDateTime, formatMoney } from '@/lib/utils';
import type { CheckinResult, DashboardStats } from '@/types/database';
import { Card, CardHeader, PageHeader, StatTile } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Inicio' };

interface RecentCheckin {
  id: string;
  checked_in_at: string;
  result: CheckinResult;
  reason: string | null;
  member: { id: string; first_name: string; last_name: string } | null;
}

const RESULT_TONE: Record<CheckinResult, 'ok' | 'warn' | 'danger'> = { granted: 'ok', warning: 'warn', denied: 'danger' };
const RESULT_LABEL: Record<CheckinResult, string> = { granted: 'Autorizado', warning: 'Alerta', denied: 'Denegado' };

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login?error=session');
  const supabase = await getSupabaseServer();
  const canCheckins = hasPermission(ctx, 'checkin', 'read') || hasPermission(ctx, 'members', 'read');

  const [statsRes, recentRes] = await Promise.all([
    supabase.rpc('dashboard_stats'),
    canCheckins
      ? supabase
          .from('attendance')
          .select('id, checked_in_at, result, reason, member:members(id, first_name, last_name)')
          .order('checked_in_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as RecentCheckin[], error: null }),
  ]);

  const stats = (statsRes.data ?? null) as DashboardStats | null;
  const recent = (recentRes.data ?? []) as unknown as RecentCheckin[];
  const currency = ctx.settings.currency;
  const firstName = (ctx.profile.full_name || ctx.profile.email).split(' ')[0];

  const quickActions = [
    { href: '/checkin', label: 'Abrir recepción', icon: ScanLine, show: hasPermission(ctx, 'checkin', 'create') },
    { href: '/members?new=1', label: 'Nuevo socio', icon: UserPlus, show: hasPermission(ctx, 'members', 'create') },
    { href: '/pos', label: 'Venta rápida', icon: ShoppingCart, show: hasPermission(ctx, 'pos', 'create') },
  ].filter((a) => a.show);

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description={`${ctx.settings.name} · ${ctx.profile.role?.name ?? ''}`}
        actions={quickActions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
          >
            <a.icon className="h-4 w-4 text-olive" />
            {a.label}
          </Link>
        ))}
      />

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Socios activos" value={stats.active_members} icon={<Users className="h-5 w-5" />} tone="olive" />
          <StatTile
            label="Ingresos hoy"
            value={stats.revenue_today === null ? '—' : formatMoney(stats.revenue_today, currency)}
            hint={stats.revenue_month === null ? 'Requiere permiso de finanzas' : `Mes: ${formatMoney(stats.revenue_month, currency)}`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="copper"
          />
          <StatTile label="Asistencias hoy" value={stats.checkins_today} icon={<Activity className="h-5 w-5" />} />
          <StatTile
            label="Vencen en 7 días"
            value={stats.expiring_soon}
            hint={`${stats.debtor_members} socios con deuda`}
            icon={<CalendarClock className="h-5 w-5" />}
            tone={stats.debtor_members > 0 ? 'danger' : 'default'}
          />
        </div>
      ) : (
        <Card className="p-5 text-sm text-danger">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          No se pudieron cargar los indicadores.
        </Card>
      )}

      {canCheckins && (
        <Card className="mt-6">
          <CardHeader title="Últimos accesos" description="Registro en tiempo real de la recepción" />
          {recent.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title="Aún no hay accesos registrados"
              description="Cuando un socio escanee su QR o digite su DNI en recepción, aparecerá aquí."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    {r.member ? (
                      <Link href={`/members/${r.member.id}`} className="truncate text-sm font-medium hover:underline">
                        {r.member.first_name} {r.member.last_name}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">Socio eliminado</span>
                    )}
                    <p className="truncate text-xs text-muted">{r.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs tabular-nums text-muted sm:inline">{formatDateTime(r.checked_in_at)}</span>
                    <Badge tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
