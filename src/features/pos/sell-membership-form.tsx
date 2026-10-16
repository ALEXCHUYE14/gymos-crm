'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { sellMembershipSchema, type SellMembershipValues } from '@/lib/validations';
import { addDaysISO, formatDate, formatMoney, PLAN_KIND_LABELS } from '@/lib/utils';
import { useCurrency } from '@/stores/session-store';
import type { PaymentMethod, Plan } from '@/types/database';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { PaymentMethodPicker } from './payment-method-picker';
import { sellMembership } from './actions';

type Output = z.output<typeof sellMembershipSchema>;

export function SellMembershipForm({
  memberId,
  plans,
  onDone,
  onCancel,
}: {
  memberId: string;
  plans: Plan[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const currency = useCurrency();
  const activePlans = useMemo(() => plans.filter((p) => p.active), [plans]);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SellMembershipValues, unknown, Output>({
    resolver: zodResolver(sellMembershipSchema),
    defaultValues: {
      member_id: memberId,
      plan_id: activePlans[0]?.id ?? '',
      payment_method: 'cash',
      amount_paid: activePlans[0]?.price ?? 0,
      start_date: '',
    },
  });

  useEffect(() => setValue('member_id', memberId), [memberId, setValue]);

  const planId = watch('plan_id');
  const startDate = watch('start_date');
  const amount = Number(watch('amount_paid') ?? 0);
  const plan = activePlans.find((p) => p.id === planId);

  useEffect(() => {
    if (plan) setValue('amount_paid', plan.price);
  }, [plan, setValue]);

  const onSubmit = async (values: Output) => {
    const res = await sellMembership(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.data.debt > 0
        ? `Membresía registrada hasta ${formatDate(res.data.end_date)}. Saldo pendiente: ${formatMoney(res.data.debt, currency)}`
        : `Membresía activa hasta ${formatDate(res.data.end_date)}`,
    );
    onDone();
  };

  if (activePlans.length === 0) {
    return <p className="text-sm text-muted">No hay planes activos. Crea uno en el módulo Planes.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Plan" htmlFor="plan_id" error={errors.plan_id?.message}>
        <Select id="plan_id" {...register('plan_id')}>
          {activePlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {PLAN_KIND_LABELS[p.kind]} · {formatMoney(p.price, currency)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Inicio (opcional)"
          htmlFor="start_date"
          error={errors.start_date?.message}
          hint="Vacío: hoy, o al día siguiente del vencimiento actual"
        >
          <Input id="start_date" type="date" {...register('start_date')} />
        </Field>
        <Field label={`Monto cobrado (${currency})`} htmlFor="amount_paid" error={errors.amount_paid?.message}>
          <Input id="amount_paid" type="number" step="0.01" min={0} inputMode="decimal" {...register('amount_paid')} />
        </Field>
      </div>
      {plan && (
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Duración</span>
            <span>{plan.duration_days} días</span>
          </div>
          {startDate && (
            <div className="flex justify-between">
              <span className="text-muted">Vence</span>
              <span>{formatDate(addDaysISO(startDate, plan.duration_days - 1))}</span>
            </div>
          )}
          {amount < plan.price && (
            <div className="mt-1 flex justify-between font-medium text-danger">
              <span>Quedará como deuda</span>
              <span>{formatMoney(plan.price - amount, currency)}</span>
            </div>
          )}
        </div>
      )}
      <Controller
        control={control}
        name="payment_method"
        render={({ field }) => <PaymentMethodPicker value={field.value as PaymentMethod} onChange={field.onChange} />}
      />
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={isSubmitting}>
          Cobrar {formatMoney(amount, currency)}
        </Button>
      </div>
    </form>
  );
}
