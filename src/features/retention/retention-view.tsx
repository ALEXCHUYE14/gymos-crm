'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cake, Check, HeartHandshake, MessageCircle, PhoneOff, UserX, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, whatsappUrl } from '@/lib/utils';
import { useSession } from '@/stores/session-store';
import type { RetentionOverview, RetentionReason } from '@/types/database';
import { Card, PageHeader, StatTile } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';
import { logRetentionContact } from './actions';

interface Row {
  id: string;
  name: string;
  firstName: string;
  phone: string | null;
  detail: string;
  lastContactAt: string | null;
  message: string;
}

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

const TAB_ICON: Record<RetentionReason, LucideIcon> = { inactive: UserX, birthday: Cake, lapsed: HeartHandshake };

export function RetentionView({ data, days, dayOptions }: { data: RetentionOverview; days: number; dayOptions: number[] }) {
  const router = useRouter();
  const { settings } = useSession();
  const gym = settings.name;
  const [tab, setTab] = useState<RetentionReason>('inactive');
  // Contactos registrados en esta visita (se muestran al instante, antes de recargar los datos)
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const lists: Record<RetentionReason, Row[]> = {
    inactive: data.inactive.map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      firstName: m.first_name,
      phone: m.phone,
      detail: m.last_visit
        ? `Última visita hace ${m.days_since} días · ${m.plan_name} hasta ${formatDate(m.end_date)}`
        : `No ha venido desde que compró · ${m.plan_name} hasta ${formatDate(m.end_date)}`,
      lastContactAt: m.last_contact_at,
      message: `Hola ${m.first_name}, te extrañamos en ${gym}. Tu plan sigue activo hasta el ${formatDate(m.end_date)}. ¿Te esperamos esta semana?`,
    })),
    birthday: data.birthdays.map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      firstName: m.first_name,
      phone: m.phone,
      detail: m.days_until === 0 ? 'Cumple años hoy' : m.days_until === 1 ? 'Cumple años mañana' : `Cumple años en ${m.days_until} días`,
      lastContactAt: m.last_contact_at,
      message: `¡Feliz cumpleaños, ${m.first_name}! Todo el equipo de ${gym} te desea un gran día.`,
    })),
    lapsed: data.lapsed.map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      firstName: m.first_name,
      phone: m.phone,
      detail: `${m.plan_name} venció hace ${m.days_since} ${m.days_since === 1 ? 'día' : 'días'} (${formatDate(m.end_date)})`,
      lastContactAt: m.last_contact_at,
      message: `Hola ${m.first_name}, tu plan ${m.plan_name} en ${gym} venció el ${formatDate(m.end_date)}. ¿Te ayudamos a renovarlo?`,
    })),
  };

  const empty: Record<RetentionReason, { title: string; description: string }> = {
    inactive: { title: 'Todos están entrenando', description: `Ningún socio con plan vigente lleva ${days} días o más sin venir.` },
    birthday: { title: 'Sin cumpleaños esta semana', description: 'Registra la fecha de nacimiento de tus socios para verlos aquí.' },
    lapsed: { title: 'Sin vencimientos recientes', description: 'Nadie dejó vencer su plan en los últimos 30 días.' },
  };

  const register = async (memberId: string) => {
    setContacted((prev) => new Set(prev).add(`${tab}:${memberId}`));
    const res = await logRetentionContact({ member_id: memberId, reason: tab });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  };

  const rows = lists[tab];

  return (
    <>
      <PageHeader
        title="Retención"
        description="Socios a los que conviene escribir hoy para que sigan entrenando"
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            Inactivos desde
            <Select
              value={String(days)}
              onChange={(e) => router.push(`/retention?dias=${e.target.value}`)}
              className="w-28"
              aria-label="Días sin venir"
            >
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </Select>
          </label>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label={`Sin venir ${days}+ días`} value={data.inactive.length} icon={<UserX className="h-5 w-5" />} tone={data.inactive.length ? 'copper' : 'default'} />
        <StatTile label="Cumpleaños (7 días)" value={data.birthdays.length} icon={<Cake className="h-5 w-5" />} tone="olive" />
        <StatTile label="Vencidos sin renovar" value={data.lapsed.length} hint="Últimos 30 días" icon={<HeartHandshake className="h-5 w-5" />} tone={data.lapsed.length ? 'danger' : 'default'} />
      </div>

      <Card>
        <div className="border-b border-line p-4">
          <Tabs<RetentionReason>
            items={[
              { key: 'inactive', label: `Sin venir (${data.inactive.length})`, icon: TAB_ICON.inactive },
              { key: 'birthday', label: `Cumpleaños (${data.birthdays.length})`, icon: TAB_ICON.birthday },
              { key: 'lapsed', label: `Vencidos (${data.lapsed.length})`, icon: TAB_ICON.lapsed },
            ]}
            value={tab}
            onChange={setTab}
            className="max-w-full overflow-x-auto"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={TAB_ICON[tab]} {...empty[tab]} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const wa = whatsappUrl(r.phone, r.message);
              const justContacted = contacted.has(`${tab}:${r.id}`);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/members/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-sm text-muted">{r.detail}</p>
                    {(justContacted || r.lastContactAt) && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-ok">
                        <Check className="h-3.5 w-3.5" />
                        Contactado {justContacted ? 'ahora' : daysAgo(r.lastContactAt as string)}
                      </p>
                    )}
                  </div>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void register(r.id)}
                      className={cn(
                        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
                        justContacted || r.lastContactAt
                          ? 'border border-line text-ink hover:bg-surface-2'
                          : 'bg-olive text-olive-fg hover:bg-olive/90',
                      )}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {justContacted || r.lastContactAt ? 'Escribir otra vez' : 'Escribir por WhatsApp'}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                      <PhoneOff className="h-4 w-4" /> Sin teléfono registrado
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
