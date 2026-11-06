'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, MessageCircle, Plus, Search, Target, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, whatsappUrl } from '@/lib/utils';
import {
  LEAD_EDITABLE_STATUSES,
  LEAD_SOURCES,
  leadSchema,
  type LeadFormValues,
  type LeadInput,
} from '@/lib/validations';
import { useCan, useSession } from '@/stores/session-store';
import type { Lead, LeadSource, LeadStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, PageHeader, StatTile } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { MemberForm } from '@/features/members/member-form';
import { convertLead, deleteLead, saveLead } from './actions';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  trial: 'Clase de prueba',
  won: 'Socio',
  lost: 'Perdido',
};

const LEAD_STATUS_TONE: Record<LeadStatus, 'neutral' | 'olive' | 'copper' | 'ok' | 'danger'> = {
  new: 'olive',
  contacted: 'neutral',
  trial: 'copper',
  won: 'ok',
  lost: 'danger',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: 'Visitó el gimnasio',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  referral: 'Recomendado por un socio',
  web: 'Página web',
  other: 'Otro',
};

type TabKey = 'open' | 'won' | 'lost';

/** "Carla Díaz Pérez" → { first_name: "Carla", last_name: "Díaz Pérez" } */
function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] ?? '', last_name: '' };
  if (parts.length === 2) return { first_name: parts[0], last_name: parts[1] };
  // 3+ palabras: se asume un nombre y el resto apellidos salvo 4+, donde van dos nombres
  const firstCount = parts.length >= 4 ? 2 : 1;
  return { first_name: parts.slice(0, firstCount).join(' '), last_name: parts.slice(firstCount).join(' ') };
}

export function LeadsManager({
  leads,
  trainers,
  today,
  truncated,
  loadError,
}: {
  leads: Lead[];
  trainers: Array<{ id: string; full_name: string }>;
  today: string;
  truncated: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const can = useCan();
  const [tab, setTab] = useState<TabKey>('open');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);

  const counts = useMemo(() => {
    const month = today.slice(0, 7);
    const open = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');
    return {
      open: open.length,
      won: leads.filter((l) => l.status === 'won').length,
      lost: leads.filter((l) => l.status === 'lost').length,
      due: open.filter((l) => l.next_follow_up && l.next_follow_up <= today).length,
      trial: open.filter((l) => l.status === 'trial').length,
      wonMonth: leads.filter((l) => l.status === 'won' && l.updated_at.slice(0, 7) === month).length,
    };
  }, [leads, today]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byTab = leads.filter((l) =>
      tab === 'open' ? l.status !== 'won' && l.status !== 'lost' : l.status === tab,
    );
    const filtered = term
      ? byTab.filter((l) =>
          [l.full_name, l.phone, l.email, l.interest].some((v) => v?.toLowerCase().includes(term)),
        )
      : byTab;
    if (tab !== 'open') return filtered;
    // Activos: primero los seguimientos vencidos o de hoy, luego por fecha de seguimiento, luego los más nuevos
    return [...filtered].sort((a, b) => {
      const fa = a.next_follow_up ?? '9999-12-31';
      const fb = b.next_follow_up ?? '9999-12-31';
      return fa === fb ? b.created_at.localeCompare(a.created_at) : fa.localeCompare(fb);
    });
  }, [leads, tab, search]);

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Prospecto',
      cell: (l) => (
        <div className="min-w-0">
          <p className="font-medium">{l.full_name}</p>
          <p className="truncate text-xs text-muted">{l.interest || LEAD_SOURCE_LABELS[l.source]}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      cell: (l) => {
        const wa = whatsappUrl(l.phone);
        if (!l.phone) return <span className="text-muted">{l.email ?? '—'}</span>;
        return wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-olive hover:underline"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {l.phone}
          </a>
        ) : (
          l.phone
        );
      },
    },
    { key: 'source', header: 'Origen', hideOnMobile: true, cell: (l) => <span className="text-muted">{LEAD_SOURCE_LABELS[l.source]}</span> },
    { key: 'status', header: 'Estado', cell: (l) => <Badge tone={LEAD_STATUS_TONE[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge> },
    {
      key: 'follow',
      header: 'Seguimiento',
      hideOnMobile: true,
      cell: (l) => {
        if (l.status === 'won' || l.status === 'lost' || !l.next_follow_up) return <span className="text-muted">—</span>;
        const overdue = l.next_follow_up < today;
        const isToday = l.next_follow_up === today;
        return (
          <span className={cn('tabular-nums', overdue ? 'font-medium text-danger' : isToday ? 'font-medium text-copper' : 'text-ink')}>
            {isToday ? 'Hoy' : formatDate(l.next_follow_up)}
            {overdue && ' · atrasado'}
          </span>
        );
      },
    },
    { key: 'created', header: 'Registrado', hideOnMobile: true, cell: (l) => <span className="text-muted">{formatDate(l.created_at)}</span> },
  ];

  const emptyCopy: Record<TabKey, { title: string; description: string }> = {
    open: {
      title: search ? 'Sin resultados' : 'No hay prospectos en seguimiento',
      description: search
        ? 'Prueba con otro nombre o teléfono.'
        : 'Registra a cada persona que pregunte por precios o venga a conocer el gimnasio, y agenda cuándo volver a contactarla.',
    },
    won: { title: 'Aún no hay conversiones', description: 'Cuando registres a un prospecto como socio, aparecerá aquí.' },
    lost: { title: 'No hay prospectos perdidos', description: 'Los prospectos que marques como perdidos aparecerán aquí con su motivo.' },
  };

  return (
    <>
      <PageHeader
        title="Prospectos"
        description="Personas interesadas en el gimnasio: haz seguimiento y conviértelas en socios"
        actions={
          can('members', 'create') && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Nuevo prospecto
            </Button>
          )
        }
      />

      {loadError && <Card className="mb-6 p-4 text-sm text-danger">{loadError}</Card>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Seguimientos para hoy"
          value={counts.due}
          hint={counts.due ? 'Incluye los atrasados' : 'Todo al día'}
          icon={<CalendarClock className="h-5 w-5" />}
          tone={counts.due ? 'copper' : 'default'}
        />
        <StatTile label="En clase de prueba" value={counts.trial} icon={<Target className="h-5 w-5" />} />
        <StatTile label="Nuevos socios este mes" value={counts.wonMonth} icon={<UserCheck className="h-5 w-5" />} tone="olive" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <Tabs<TabKey>
            items={[
              { key: 'open', label: `En seguimiento (${counts.open})` },
              { key: 'won', label: `Socios (${counts.won})` },
              { key: 'lost', label: `Perdidos (${counts.lost})` },
            ]}
            value={tab}
            onChange={setTab}
            className="max-w-full overflow-x-auto"
          />
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              aria-label="Buscar prospectos"
              className="pl-9"
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(l) => l.id}
          onRowClick={(l) => setEditing(l)}
          empty={{ icon: Target, ...emptyCopy[tab] }}
        />
        {truncated && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Se muestran los 1000 prospectos más recientes.
          </p>
        )}
      </Card>

      <LeadModal
        lead={editing}
        today={today}
        onClose={() => setEditing(null)}
        onConvert={(lead) => {
          setEditing(null);
          setConverting(lead);
        }}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={!!converting}
        onClose={() => setConverting(null)}
        title="Registrar como socio"
        description="Completa sus datos. El prospecto quedará marcado como socio."
        size="lg"
      >
        {converting && (
          <MemberForm
            initial={{ ...splitName(converting.full_name), phone: converting.phone, email: converting.email }}
            trainers={trainers}
            submitLabel="Registrar socio"
            onSubmit={(values) => convertLead(converting.id, values)}
            onCancel={() => setConverting(null)}
            onDone={(result) => {
              setConverting(null);
              const id = result.ok ? (result.data as { id?: string } | undefined)?.id : undefined;
              if (id) router.push(`/members/${id}`);
              else router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function LeadModal({
  lead,
  today,
  onClose,
  onConvert,
  onSaved,
}: {
  lead: Lead | 'new' | null;
  today: string;
  onClose: () => void;
  onConvert: (lead: Lead) => void;
  onSaved: () => void;
}) {
  const open = lead !== null;
  const existing = lead && lead !== 'new' ? lead : null;
  const title = existing ? existing.full_name : 'Nuevo prospecto';
  return (
    <Modal open={open} onClose={onClose} title={title} description={existing ? `Registrado el ${formatDate(existing.created_at)}` : undefined} size="lg">
      {open &&
        (existing?.status === 'won' ? (
          <WonSummary lead={existing} />
        ) : (
          // key: reinicia el formulario al cambiar de prospecto
          <LeadForm key={existing?.id ?? 'new'} lead={existing} today={today} onCancel={onClose} onConvert={onConvert} onSaved={onSaved} />
        ))}
    </Modal>
  );
}

function WonSummary({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Este prospecto ya es socio del gimnasio. Su historial de pagos y asistencias está en su perfil.
      </p>
      {lead.notes && <p className="rounded-xl bg-surface-2 p-3 text-ink">{lead.notes}</p>}
      {lead.member_id ? (
        <Link href={`/members/${lead.member_id}`} className="inline-flex items-center gap-2 font-medium text-olive hover:underline">
          <UserCheck className="h-4 w-4" /> Ver perfil del socio
        </Link>
      ) : (
        <p className="text-muted">El socio vinculado fue eliminado.</p>
      )}
    </div>
  );
}

function LeadForm({
  lead,
  today,
  onCancel,
  onConvert,
  onSaved,
}: {
  lead: Lead | null;
  today: string;
  onCancel: () => void;
  onConvert: (lead: Lead) => void;
  onSaved: () => void;
}) {
  const can = useCan();
  const { settings } = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const canEdit = lead ? can('members', 'update') : can('members', 'create');
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues, unknown, LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      full_name: lead?.full_name ?? '',
      phone: lead?.phone ?? '',
      email: lead?.email ?? '',
      source: lead?.source ?? 'walk_in',
      interest: lead?.interest ?? '',
      status: lead && lead.status !== 'won' ? lead.status : 'new',
      next_follow_up: lead ? (lead.next_follow_up ?? '') : today,
      trial_date: lead?.trial_date ?? '',
      notes: lead?.notes ?? '',
      lost_reason: lead?.lost_reason ?? '',
    },
  });
  const status = watch('status');
  const firstName = (lead?.full_name ?? '').split(/\s+/)[0];
  const wa = lead
    ? whatsappUrl(lead.phone, `Hola ${firstName}, te escribimos de ${settings.name}. ¿Pudiste revisar la información de nuestros planes?`)
    : null;

  const submit = async (values: LeadInput) => {
    const res = await saveLead(lead?.id ?? null, values);
    if (!res.ok) {
      Object.entries(res.fieldErrors ?? {}).forEach(([field, msgs]) => {
        if (msgs?.[0]) setError(field as keyof LeadFormValues, { message: msgs[0] });
      });
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? 'Guardado');
    onSaved();
  };

  const runDelete = () =>
    startDelete(async () => {
      if (!lead) return;
      const res = await deleteLead(lead.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Eliminado');
      setConfirmDelete(false);
      onSaved();
    });

  return (
    <>
      {lead && (
        <div className="mb-5 flex flex-wrap gap-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
            >
              <MessageCircle className="h-4 w-4 text-olive" /> Escribir por WhatsApp
            </a>
          )}
          {can('members', 'create') && lead.status !== 'lost' && (
            <Button onClick={() => onConvert(lead)}>
              <UserPlus className="h-4 w-4" /> Registrar como socio
            </Button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" htmlFor="full_name" error={errors.full_name?.message} className="sm:col-span-2">
              <Input id="full_name" autoComplete="off" aria-invalid={!!errors.full_name} {...register('full_name')} />
            </Field>
            <Field label="Teléfono" htmlFor="lead_phone" error={errors.phone?.message}>
              <Input id="lead_phone" type="tel" inputMode="tel" placeholder="987 654 321" aria-invalid={!!errors.phone} {...register('phone')} />
            </Field>
            <Field label="Correo" htmlFor="lead_email" error={errors.email?.message}>
              <Input id="lead_email" type="email" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
            </Field>
            <Field label="¿Cómo nos conoció?" htmlFor="source" error={errors.source?.message}>
              <Select id="source" {...register('source')}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Le interesa" htmlFor="interest" error={errors.interest?.message}>
              <Input id="interest" placeholder="Plan mensual, CrossFit, bajar de peso…" {...register('interest')} />
            </Field>
            <Field label="Estado" htmlFor="lead_status" error={errors.status?.message}>
              <Select id="lead_status" {...register('status')}>
                {LEAD_EDITABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Próximo seguimiento" htmlFor="next_follow_up" error={errors.next_follow_up?.message}>
              <Input id="next_follow_up" type="date" {...register('next_follow_up')} />
            </Field>
            {status === 'trial' && (
              <Field label="Fecha de la clase de prueba" htmlFor="trial_date" error={errors.trial_date?.message}>
                <Input id="trial_date" type="date" {...register('trial_date')} />
              </Field>
            )}
            {status === 'lost' && (
              <Field label="Motivo" htmlFor="lost_reason" error={errors.lost_reason?.message} className="sm:col-span-2">
                <Input id="lost_reason" placeholder="Precio, horario, se fue a otro gimnasio…" {...register('lost_reason')} />
              </Field>
            )}
            <Field label="Notas" htmlFor="lead_notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea id="lead_notes" placeholder="Qué conversaron, objeciones, qué plan le ofreciste…" {...register('notes')} />
            </Field>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {lead && can('members', 'delete') ? (
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              {canEdit ? 'Cancelar' : 'Cerrar'}
            </Button>
            {canEdit && (
              <Button type="submit" loading={isSubmitting}>
                {lead ? 'Guardar cambios' : 'Registrar prospecto'}
              </Button>
            )}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={runDelete}
        loading={deleting}
        title="Eliminar prospecto"
        description="Se borrarán sus datos y notas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </>
  );
}
