'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Dumbbell,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/errors';
import { groupClassSchema, routineSchema, type GroupClassFormValues, type RoutineFormValues } from '@/lib/validations';
import { cn, formatDate, formatDateTime, todayISO } from '@/lib/utils';
import { useCan, useSession } from '@/stores/session-store';
import type { BookingStatus, Discipline, Exercise, GroupClass, Routine } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { MemberPicker, type PickedMember } from '@/features/pos/member-picker';
import { bookClass, deleteClass, deleteRoutine, saveClass, saveRoutine, setBookingStatus, setRoutineActive } from './actions';

export interface RoutineRow extends Routine {
  member: PickedMember | null;
  trainer: { full_name: string } | null;
}
export interface ClassRow extends GroupClass {
  trainer: { full_name: string } | null;
  bookings: Array<{ count: number }>;
}
interface BookingRow {
  id: string;
  status: BookingStatus;
  member: { id: string; first_name: string; last_name: string; dni: string } | null;
}

type Tab = 'routines' | 'classes';
const DISCIPLINES: Discipline[] = ['CrossFit', 'Spinning', 'Yoga', 'Funcional', 'Otro'];

export function RoutinesManager({
  routines,
  classes,
  trainers,
}: {
  routines: RoutineRow[];
  classes: ClassRow[];
  trainers: Array<{ id: string; full_name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('routines');
  const [routineEditing, setRoutineEditing] = useState<RoutineRow | 'new' | null>(null);
  const [presetMemberId] = useState(params.get('member'));
  const [classEditing, setClassEditing] = useState<ClassRow | 'new' | null>(null);
  const [bookingsFor, setBookingsFor] = useState<ClassRow | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: 'routine' | 'class'; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetMemberId && can('routines', 'create')) setRoutineEditing('new');
  }, [presetMemberId, can]);

  const refresh = () => router.refresh();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { key: 'routines', label: 'Rutinas', icon: ClipboardList },
            { key: 'classes', label: 'Clases grupales', icon: CalendarClock },
          ]}
          value={tab}
          onChange={setTab}
        />
        {can('routines', 'create') && (
          <Button onClick={() => (tab === 'routines' ? setRoutineEditing('new') : setClassEditing('new'))}>
            <Plus className="h-4 w-4" /> {tab === 'routines' ? 'Nueva rutina' : 'Programar clase'}
          </Button>
        )}
      </div>

      {tab === 'routines' ? (
        routines.length === 0 ? (
          <Card>
            <EmptyState icon={Dumbbell} title="Sin rutinas asignadas" description="Crea una rutina con ejercicios, series y descansos, y asígnala a un socio." />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {routines.map((r) => (
              <Card key={r.id} className={cn(!r.active && 'opacity-60')}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display font-semibold">{r.title}</h3>
                      <p className="truncate text-sm text-muted">
                        {r.member ? `${r.member.first_name} ${r.member.last_name}` : 'Socio eliminado'}
                      </p>
                    </div>
                    <Badge tone={r.active ? 'olive' : 'neutral'}>{r.active ? 'Activa' : 'Finalizada'}</Badge>
                  </div>
                  {r.goal && <p className="mt-2 text-sm">{r.goal}</p>}
                  <ul className="mt-3 space-y-1 text-sm">
                    {r.exercises.slice(0, 4).map((e, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{e.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {e.sets}×{e.reps}
                        </span>
                      </li>
                    ))}
                    {r.exercises.length > 4 && <li className="text-xs text-muted">+{r.exercises.length - 4} ejercicios</li>}
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    {r.trainer?.full_name ?? 'Sin entrenador'} · desde {formatDate(r.start_date)}
                    {r.end_date ? ` hasta ${formatDate(r.end_date)}` : ''}
                  </p>
                </div>
                {(can('routines', 'update') || can('routines', 'delete')) && (
                  <div className="flex justify-end gap-1 border-t border-line px-3 py-2">
                    {can('routines', 'update') && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setRoutineEditing(r)}>
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const res = await setRoutineActive(r.id, !r.active);
                            if (!res.ok) return void toast.error(res.error);
                            toast.success(res.message ?? 'Actualizada');
                            refresh();
                          }}
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> {r.active ? 'Finalizar' : 'Reactivar'}
                        </Button>
                      </>
                    )}
                    {can('routines', 'delete') && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setToDelete({ kind: 'routine', id: r.id, label: r.title })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title="Sin clases programadas" description="Programa CrossFit, Spinning, Yoga o Funcional con aforo máximo y controla las reservas." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {classes.map((c) => {
              const taken = c.bookings[0]?.count ?? 0;
              const pct = Math.min(100, Math.round((taken / c.capacity) * 100));
              return (
                <li key={c.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      <Badge tone="copper">{c.discipline}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted">
                      <span>{formatDateTime(c.starts_at)} · {c.duration_min} min</span>
                      <span>{c.trainer?.full_name ?? 'Sin entrenador'}</span>
                      {c.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.location}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="w-full md:w-48">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">Aforo</span>
                      <span className="tabular-nums">
                        {taken}/{c.capacity}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-olive')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setBookingsFor(c)}>
                      <Users className="h-3.5 w-3.5" /> Reservas
                    </Button>
                    {can('routines', 'update') && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setClassEditing(c)} aria-label="Editar clase">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {can('routines', 'delete') && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={() => setToDelete({ kind: 'class', id: c.id, label: c.name })} aria-label="Eliminar clase">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal open={routineEditing !== null} onClose={() => setRoutineEditing(null)} title={routineEditing === 'new' ? 'Nueva rutina' : 'Editar rutina'} size="lg">
        {routineEditing !== null && (
          <RoutineForm
            routine={routineEditing === 'new' ? null : routineEditing}
            presetMemberId={routineEditing === 'new' ? presetMemberId : null}
            onCancel={() => setRoutineEditing(null)}
            onSaved={() => {
              setRoutineEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>

      <Modal open={classEditing !== null} onClose={() => setClassEditing(null)} title={classEditing === 'new' ? 'Programar clase' : 'Editar clase'}>
        {classEditing !== null && (
          <ClassForm
            groupClass={classEditing === 'new' ? null : classEditing}
            trainers={trainers}
            onCancel={() => setClassEditing(null)}
            onSaved={() => {
              setClassEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>

      <BookingsModal groupClass={bookingsFor} onClose={() => setBookingsFor(null)} onChanged={refresh} />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={busy}
        title={toDelete?.kind === 'class' ? 'Eliminar clase' : 'Eliminar rutina'}
        description={`¿Eliminar "${toDelete?.label}"? ${toDelete?.kind === 'class' ? 'También se eliminarán sus reservas.' : ''}`}
        onConfirm={async () => {
          if (!toDelete) return;
          setBusy(true);
          const res = toDelete.kind === 'class' ? await deleteClass(toDelete.id) : await deleteRoutine(toDelete.id);
          setBusy(false);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? 'Eliminado');
          setToDelete(null);
          refresh();
        }}
      />
    </div>
  );
}

function RoutineForm({
  routine,
  presetMemberId,
  onCancel,
  onSaved,
}: {
  routine: RoutineRow | null;
  presetMemberId: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [member, setMember] = useState<PickedMember | null>(routine?.member ?? null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RoutineFormValues, unknown, z.output<typeof routineSchema>>({
    resolver: zodResolver(routineSchema),
    defaultValues: {
      member_id: routine?.member_id ?? '',
      title: routine?.title ?? '',
      goal: routine?.goal ?? '',
      start_date: routine?.start_date ?? todayISO(),
      end_date: routine?.end_date ?? '',
      exercises: routine?.exercises?.length
        ? routine.exercises
        : [{ name: '', sets: 4, reps: '10', rest_seconds: 60, notes: '' } satisfies Exercise],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' });

  useEffect(() => {
    if (!presetMemberId || member) return;
    getSupabaseBrowser()
      .from('members')
      .select('id, dni, first_name, last_name, status')
      .eq('id', presetMemberId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMember(data as PickedMember);
          setValue('member_id', (data as PickedMember).id);
        }
      });
  }, [presetMemberId, member, setValue]);

  const submit = handleSubmit(async (values) => {
    const res = await saveRoutine(routine?.id ?? null, values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? 'Guardada');
    onSaved();
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Socio" error={errors.member_id?.message}>
        <MemberPicker
          value={member}
          onChange={(m) => {
            setMember(m);
            setValue('member_id', m?.id ?? '', { shouldValidate: true });
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" htmlFor="r-title" error={errors.title?.message}>
          <Input id="r-title" placeholder="Hipertrofia tren superior" {...register('title')} />
        </Field>
        <Field label="Objetivo" htmlFor="r-goal" error={errors.goal?.message}>
          <Input id="r-goal" placeholder="Ganar masa muscular" {...register('goal')} />
        </Field>
        <Field label="Inicio" htmlFor="r-start" error={errors.start_date?.message}>
          <Input id="r-start" type="date" {...register('start_date')} />
        </Field>
        <Field label="Fin (opcional)" htmlFor="r-end" error={errors.end_date?.message}>
          <Input id="r-end" type="date" {...register('end_date')} />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Ejercicios</p>
          <Button size="sm" variant="outline" onClick={() => append({ name: '', sets: 3, reps: '12', rest_seconds: 60, notes: '' })}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        {errors.exercises?.message && <p className="mb-2 text-xs text-danger">{errors.exercises.message}</p>}
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-12 gap-2 rounded-xl border border-line p-2.5">
              <Input className="col-span-12 sm:col-span-5" placeholder="Ejercicio" aria-label="Ejercicio" aria-invalid={!!errors.exercises?.[i]?.name} {...register(`exercises.${i}.name`)} />
              <Input className="col-span-3 sm:col-span-2" type="number" min={1} placeholder="Series" aria-label="Series" {...register(`exercises.${i}.sets`)} />
              <Input className="col-span-3 sm:col-span-2" placeholder="Reps" aria-label="Repeticiones" {...register(`exercises.${i}.reps`)} />
              <Input className="col-span-4 sm:col-span-2" type="number" min={0} placeholder="Desc. (s)" aria-label="Descanso en segundos" {...register(`exercises.${i}.rest_seconds`)} />
              <Button
                size="icon"
                variant="ghost"
                className="col-span-2 h-10 w-full text-danger sm:col-span-1"
                onClick={() => remove(i)}
                disabled={fields.length === 1}
                aria-label="Quitar ejercicio"
              >
                <X className="h-4 w-4" />
              </Button>
              <Textarea className="col-span-12 min-h-[40px]" placeholder="Notas técnicas (opcional)" aria-label="Notas" {...register(`exercises.${i}.notes`)} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar rutina
        </Button>
      </div>
    </form>
  );
}

function toLocalInput(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function ClassForm({
  groupClass,
  trainers,
  onCancel,
  onSaved,
}: {
  groupClass: ClassRow | null;
  trainers: Array<{ id: string; full_name: string }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { settings } = useSession();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GroupClassFormValues, unknown, z.output<typeof groupClassSchema>>({
    resolver: zodResolver(groupClassSchema),
    defaultValues: {
      name: groupClass?.name ?? '',
      discipline: groupClass?.discipline ?? 'Funcional',
      trainer_id: groupClass?.trainer_id ?? '',
      starts_at: groupClass ? toLocalInput(groupClass.starts_at, settings.timezone) : '',
      duration_min: groupClass?.duration_min ?? 60,
      capacity: groupClass?.capacity ?? 20,
      location: groupClass?.location ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    const res = await saveClass(groupClass?.id ?? null, values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? 'Guardada');
    onSaved();
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="c-name" error={errors.name?.message}>
          <Input id="c-name" placeholder="Spinning intenso" {...register('name')} />
        </Field>
        <Field label="Disciplina" htmlFor="c-disc" error={errors.discipline?.message}>
          <Select id="c-disc" {...register('discipline')}>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Fecha y hora (${settings.timezone})`} htmlFor="c-start" error={errors.starts_at?.message}>
          <Input id="c-start" type="datetime-local" {...register('starts_at')} />
        </Field>
        <Field label="Duración (min)" htmlFor="c-dur" error={errors.duration_min?.message}>
          <Input id="c-dur" type="number" min={15} step={5} {...register('duration_min')} />
        </Field>
        <Field label="Aforo máximo" htmlFor="c-cap" error={errors.capacity?.message}>
          <Input id="c-cap" type="number" min={1} {...register('capacity')} />
        </Field>
        <Field label="Entrenador" htmlFor="c-trainer" error={errors.trainer_id?.message}>
          <Select id="c-trainer" {...register('trainer_id')}>
            <option value="">Sin asignar</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Sala / ubicación" htmlFor="c-loc" error={errors.location?.message}>
        <Input id="c-loc" placeholder="Sala 2" {...register('location')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar clase
        </Button>
      </div>
    </form>
  );
}

function BookingsModal({ groupClass, onClose, onChanged }: { groupClass: ClassRow | null; onClose: () => void; onChanged: () => void }) {
  const can = useCan();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<PickedMember | null>(null);
  const [saving, setSaving] = useState(false);
  const canBook = can('routines', 'create') || can('checkin', 'create');

  const load = async (classId: string) => {
    setLoading(true);
    const { data, error } = await getSupabaseBrowser()
      .from('class_bookings')
      .select('id, status, member:members(id, first_name, last_name, dni)')
      .eq('class_id', classId)
      .order('created_at');
    setLoading(false);
    if (error) return void toast.error(humanizeError(error));
    setBookings((data ?? []) as unknown as BookingRow[]);
  };

  useEffect(() => {
    if (groupClass) void load(groupClass.id);
    else {
      setBookings([]);
      setMember(null);
    }
  }, [groupClass]);

  const active = bookings.filter((b) => b.status !== 'cancelled').length;

  return (
    <Modal
      open={!!groupClass}
      onClose={onClose}
      title={groupClass ? `Reservas · ${groupClass.name}` : 'Reservas'}
      description={groupClass ? `${formatDateTime(groupClass.starts_at)} · ${active}/${groupClass.capacity} cupos` : undefined}
      size="md"
    >
      {groupClass && (
        <div className="space-y-4">
          {canBook && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <MemberPicker value={member} onChange={setMember} />
              </div>
              <Button
                disabled={!member || active >= groupClass.capacity}
                loading={saving}
                onClick={async () => {
                  if (!member) return;
                  setSaving(true);
                  const res = await bookClass(groupClass.id, member.id);
                  setSaving(false);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message ?? 'Reservado');
                  setMember(null);
                  await load(groupClass.id);
                  onChanged();
                }}
              >
                <UserPlus className="h-4 w-4" /> Reservar
              </Button>
            </div>
          )}
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Cargando…</p>
          ) : bookings.length === 0 ? (
            <CardBody className="text-center text-sm text-muted">Aún no hay reservas para esta clase.</CardBody>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className={cn('truncate text-sm font-medium', b.status === 'cancelled' && 'line-through opacity-60')}>
                      {b.member ? `${b.member.first_name} ${b.member.last_name}` : 'Socio eliminado'}
                    </p>
                    <p className="font-mono text-xs text-muted">{b.member?.dni}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={b.status === 'attended' ? 'ok' : b.status === 'cancelled' ? 'neutral' : 'olive'}>
                      {{ booked: 'Reservado', attended: 'Asistió', cancelled: 'Cancelado' }[b.status]}
                    </Badge>
                    {(can('routines', 'update') || can('checkin', 'create')) &&
                      b.status === 'booked' &&
                      (['attended', 'cancelled'] as BookingStatus[]).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const res = await setBookingStatus(b.id, s);
                            if (!res.ok) return void toast.error(res.error);
                            await load(groupClass.id);
                            onChanged();
                          }}
                        >
                          {s === 'attended' ? 'Asistió' : 'Cancelar'}
                        </Button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

