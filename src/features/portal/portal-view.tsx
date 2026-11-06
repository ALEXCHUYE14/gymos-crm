'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, Clock, Dumbbell, MapPin, MessageCircle, Sun, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, formatMoney, whatsappUrl } from '@/lib/utils';
import type { PortalClass, PortalData } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { bookPortalClass, cancelPortalBooking } from './actions';

type TabKey = 'classes' | 'routine';

/** YYYY-MM-DD de un instante en la zona horaria del gimnasio. */
function dayKey(iso: string | number, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

function timeLabel(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('es-PE', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function dayLabel(key: string, todayKey: string, tomorrowKey: string) {
  if (key === todayKey) return 'Hoy';
  if (key === tomorrowKey) return 'Mañana';
  const label = formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function PortalView({ token, data, logoUrl, now }: { token: string; data: PortalData; logoUrl: string | null; now: number }) {
  const { business, member, membership } = data;
  const tz = business.timezone || 'America/Lima';
  const [tab, setTab] = useState<TabKey>('classes');
  const todayKey = dayKey(now, tz);
  const tomorrowKey = dayKey(now + 864e5, tz);

  const access = (() => {
    if (membership?.status === 'frozen') {
      return { tone: 'warn', title: 'Membresía congelada', detail: `${membership.plan} · acércate a recepción para reactivarla` } as const;
    }
    if (membership && membership.start_date > todayKey) {
      return { tone: 'ok', title: 'Tu plan empieza pronto', detail: `${membership.plan} · desde el ${formatDate(membership.start_date)}` } as const;
    }
    if (membership) {
      return { tone: 'ok', title: 'Membresía activa', detail: `${membership.plan} · hasta el ${formatDate(membership.end_date)}` } as const;
    }
    return {
      tone: 'danger',
      title: 'Sin membresía vigente',
      detail: data.last_end_date ? `Tu plan venció el ${formatDate(data.last_end_date)}. Renuévalo en recepción.` : 'Elige un plan en recepción para empezar.',
    } as const;
  })();

  const contact = whatsappUrl(business.phone, `Hola, soy ${member.first_name} ${member.last_name}, socio de ${business.name}.`);

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto max-w-md px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-9 w-9 rounded-full border border-line bg-white object-contain p-0.5" />}
          <span className="truncate font-display text-sm font-semibold">{business.name}</span>
        </header>

        <h1 className="mt-6 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Hola, {member.first_name}</h1>

        {/* Acceso: lo primero que necesita el socio al llegar al gimnasio */}
        <section aria-label="Tu acceso" className="mt-5 rounded-3xl border border-line bg-surface p-5 shadow-xs">
          <div className="mx-auto w-fit rounded-2xl bg-white p-4">
            <QRCodeSVG value={member.qr_token} size={208} level="M" marginSize={0} title="Tu código de ingreso" />
          </div>
          <p className="mt-3 text-center text-sm text-muted">Muestra este código en recepción. Sube el brillo si el lector no lo detecta.</p>

          <div className="mt-5 border-t border-line pt-4">
            <p className="flex items-center gap-2 font-medium">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  access.tone === 'ok' ? 'bg-ok' : access.tone === 'warn' ? 'bg-warn' : 'bg-danger',
                )}
                aria-hidden
              />
              {access.title}
            </p>
            <p className="mt-0.5 pl-[18px] text-sm text-muted">{access.detail}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                <dt className="text-xs text-muted">Visitas en 30 días</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">{data.visits_30d}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                <dt className="text-xs text-muted">Clases disponibles</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">
                  {membership?.class_credits_left ?? (membership ? 'Libre' : '—')}
                </dd>
              </div>
            </dl>

            {Number(data.debt) > 0 && (
              <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                Tienes un saldo pendiente de {formatMoney(data.debt, business.currency)}. Puedes pagarlo en recepción.
              </p>
            )}
          </div>
        </section>

        <Tabs<TabKey>
          items={[
            { key: 'classes', label: 'Clases', icon: CalendarDays },
            { key: 'routine', label: 'Mi rutina', icon: Dumbbell },
          ]}
          value={tab}
          onChange={setTab}
          className="mt-8 grid w-full grid-cols-2"
        />

        <div className="mt-4">
          {tab === 'classes' ? (
            <ClassList token={token} classes={data.classes} tz={tz} now={now} todayKey={todayKey} tomorrowKey={tomorrowKey} />
          ) : (
            <RoutineList routines={data.routines} />
          )}
        </div>

        <footer className="mt-10 space-y-3 border-t border-line pt-6 text-sm text-muted">
          <p className="font-medium text-ink">{business.name}</p>
          {business.address && (
            <p className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {business.address}
            </p>
          )}
          <p className="flex gap-2">
            <Sun className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Lunes a viernes {business.opening_hours.weekdays} · Sábado {business.opening_hours.saturday} · Domingo{' '}
              {business.opening_hours.sunday}
            </span>
          </p>
          {contact && (
            <a href={contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium text-olive hover:underline">
              <MessageCircle className="h-4 w-4" /> Escribir al gimnasio
            </a>
          )}
          <p className="pt-2 text-xs">
            Para tenerlo siempre a mano, agrega esta página a la pantalla de inicio desde el menú de tu navegador.
          </p>
        </footer>
      </div>
    </main>
  );
}

function ClassList({
  token,
  classes,
  tz,
  now,
  todayKey,
  tomorrowKey,
}: {
  token: string;
  classes: PortalClass[];
  tz: string;
  now: number;
  todayKey: string;
  tomorrowKey: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const groups = useMemo(() => {
    const map = new Map<string, PortalClass[]>();
    for (const c of classes) {
      const key = dayKey(c.starts_at, tz);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [classes, tz]);

  const act = (c: PortalClass, kind: 'book' | 'cancel') => {
    setPendingId(c.id);
    startTransition(async () => {
      const res = kind === 'book' ? await bookPortalClass(token, c.id) : await cancelPortalBooking(token, c.booking_id);
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Listo');
      router.refresh();
    });
  };

  if (!classes.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
        No hay clases programadas para los próximos 14 días.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([key, list]) => (
        <section key={key}>
          <h2 className="mb-2 text-sm font-semibold text-muted">{dayLabel(key, todayKey, tomorrowKey)}</h2>
          <ul className="space-y-2">
            {list.map((c) => {
              const free = Math.max(0, c.capacity - Number(c.taken));
              const booked = c.booking_status === 'booked';
              const started = new Date(c.starts_at).getTime() <= now;
              return (
                <li key={c.id} className={cn('rounded-2xl border bg-surface p-4', booked ? 'border-olive/40' : 'border-line')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3.5 w-3.5" /> {timeLabel(c.starts_at, tz)} · {c.duration_min} min
                        </span>
                        {c.trainer && <span>{c.trainer}</span>}
                        {c.location && <span>{c.location}</span>}
                      </p>
                    </div>
                    {booked && <span className="shrink-0 rounded-full bg-olive-soft px-2.5 py-1 text-xs font-medium text-olive">Reservado</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-sm', free === 0 && !booked ? 'text-danger' : 'text-muted')}>
                      <Users className="h-3.5 w-3.5" />
                      {free === 0 ? 'Sin cupos' : `${free} ${free === 1 ? 'cupo libre' : 'cupos libres'}`}
                    </span>
                    {booked ? (
                      !started && (
                        <Button variant="ghost" size="sm" loading={pendingId === c.id} onClick={() => act(c, 'cancel')}>
                          Cancelar reserva
                        </Button>
                      )
                    ) : started ? (
                      <span className="text-sm text-muted">En curso</span>
                    ) : (
                      free > 0 && (
                        <Button size="sm" loading={pendingId === c.id} disabled={pendingId !== null} onClick={() => act(c, 'book')}>
                          Reservar
                        </Button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RoutineList({ routines }: { routines: PortalData['routines'] }) {
  if (!routines.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
        Aún no tienes una rutina asignada. Pídela a tu entrenador.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {routines.map((r) => (
        <section key={r.id} className="rounded-2xl border border-line bg-surface">
          <header className="border-b border-line px-4 py-3">
            <h2 className="font-medium">{r.title}</h2>
            <p className="text-sm text-muted">
              {[r.goal, r.trainer && `Entrenador: ${r.trainer}`].filter(Boolean).join(' · ') || `Desde el ${formatDate(r.start_date)}`}
            </p>
          </header>
          <ol className="divide-y divide-line">
            {r.exercises.map((e, i) => (
              <li key={`${r.id}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.name}</p>
                  {e.notes && <p className="text-muted">{e.notes}</p>}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p>
                    {e.sets} × {e.reps}
                  </p>
                  <p className="text-xs text-muted">Descanso {e.rest_seconds} s</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
