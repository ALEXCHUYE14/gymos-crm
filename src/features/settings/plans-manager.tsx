'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { planSchema, type PlanFormValues } from '@/lib/validations';
import { formatMoney, PLAN_KIND_LABELS } from '@/lib/utils';
import { useCan, useCurrency } from '@/stores/session-store';
import type { Plan, PlanKind } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { deletePlan, savePlan } from './plan-actions';

const DEFAULT_DAYS: Record<PlanKind, number> = { daily: 1, monthly: 30, quarterly: 90, annual: 365, class_pack: 30 };

export function PlansManager({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const can = useCan();
  const currency = useCurrency();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      {can('settings', 'update') && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Nuevo plan
          </Button>
        </div>
      )}
      {plans.length === 0 ? (
        <Card>
          <EmptyState icon={Tags} title="Sin planes" description="Crea pases diarios, mensualidades o paquetes de clases para empezar a vender membresías." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? '' : 'opacity-60'}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge tone="copper">{PLAN_KIND_LABELS[p.kind]}</Badge>
                    <h3 className="mt-2 font-display text-lg font-semibold">{p.name}</h3>
                  </div>
                  {!p.active && <Badge>Inactivo</Badge>}
                </div>
                <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{formatMoney(p.price, currency)}</p>
                <p className="mt-1 text-sm text-muted">
                  {p.duration_days} día(s)
                  {p.class_credits ? ` · ${p.class_credits} clases` : ''}
                </p>
                {p.description && <p className="mt-3 text-sm text-ink/80">{p.description}</p>}
              </div>
              {(can('settings', 'update') || can('settings', 'delete')) && (
                <div className="flex justify-end gap-1 border-t border-line px-3 py-2">
                  {can('settings', 'update') && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  {can('settings', 'delete') && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setToDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo plan' : 'Editar plan'}>
        {editing !== null && (
          <PlanForm
            plan={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={deleting}
        title="Eliminar plan"
        description={`¿Eliminar "${toDelete?.name}"? Si ya se vendió, quedará inactivo para conservar el historial.`}
        onConfirm={async () => {
          if (!toDelete) return;
          setDeleting(true);
          const res = await deletePlan(toDelete.id);
          setDeleting(false);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? 'Eliminado');
          setToDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

function PlanForm({ plan, onCancel, onSaved }: { plan: Plan | null; onCancel: () => void; onSaved: () => void }) {
  const currency = useCurrency();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues, unknown, z.output<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: plan?.name ?? '',
      kind: plan?.kind ?? 'monthly',
      duration_days: plan?.duration_days ?? 30,
      price: plan?.price ?? 0,
      class_credits: plan?.class_credits ?? '',
      description: plan?.description ?? '',
      active: plan?.active ?? true,
    },
  });
  const kind = watch('kind');

  const submit = handleSubmit(async (values) => {
    const res = await savePlan(plan?.id ?? null, values);
    if (!res.ok) {
      Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) => v?.[0] && setError(k as keyof PlanFormValues, { message: v[0] }));
      return void toast.error(res.error);
    }
    toast.success(res.message ?? 'Guardado');
    onSaved();
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nombre" htmlFor="pl-name" error={errors.name?.message}>
        <Input id="pl-name" {...register('name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="pl-kind" error={errors.kind?.message}>
          <Select
            id="pl-kind"
            {...register('kind', {
              onChange: (e: { target: { value: PlanKind } }) => setValue('duration_days', DEFAULT_DAYS[e.target.value]),
            })}
          >
            {(Object.keys(PLAN_KIND_LABELS) as PlanKind[]).map((k) => (
              <option key={k} value={k}>
                {PLAN_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duración (días)" htmlFor="pl-days" error={errors.duration_days?.message}>
          <Input id="pl-days" type="number" min={1} inputMode="numeric" {...register('duration_days')} />
        </Field>
        <Field label={`Precio (${currency})`} htmlFor="pl-price" error={errors.price?.message}>
          <Input id="pl-price" type="number" step="0.01" min={0} inputMode="decimal" {...register('price')} />
        </Field>
        {kind === 'class_pack' && (
          <Field label="Cantidad de clases" htmlFor="pl-credits" error={errors.class_credits?.message}>
            <Input id="pl-credits" type="number" min={1} inputMode="numeric" {...register('class_credits')} />
          </Field>
        )}
      </div>
      <Field label="Descripción" htmlFor="pl-desc" error={errors.description?.message}>
        <Textarea id="pl-desc" {...register('description')} />
      </Field>
      <div className="flex items-center gap-3">
        <Switch id="pl-active" checked={!!watch('active')} onChange={(v) => setValue('active', v)} label="Plan activo" />
        <label htmlFor="pl-active" className="text-sm">
          Disponible para la venta
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar plan
        </Button>
      </div>
    </form>
  );
}
