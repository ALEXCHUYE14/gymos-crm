'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { memberSchema, type MemberFormValues, type MemberInput } from '@/lib/validations';
import type { ActionResult, Member } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

interface MemberFormProps {
  initial?: Partial<Member>;
  trainers: Array<{ id: string; full_name: string }>;
  submitLabel: string;
  onSubmit: (values: MemberInput) => Promise<ActionResult<unknown>>;
  onDone: (result: ActionResult<unknown>) => void;
  onCancel: () => void;
}

export function MemberForm({ initial, trainers, submitLabel, onSubmit, onDone, onCancel }: MemberFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues, unknown, MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      dni: initial?.dni ?? '',
      first_name: initial?.first_name ?? '',
      last_name: initial?.last_name ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      birth_date: initial?.birth_date ?? '',
      gender: initial?.gender ?? '',
      medical_notes: initial?.medical_notes ?? '',
      emergency_contact: initial?.emergency_contact ?? '',
      trainer_id: initial?.trainer_id ?? '',
    },
  });

  const submit = async (values: MemberInput) => {
    const result = await onSubmit(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        Object.entries(result.fieldErrors).forEach(([field, msgs]) => {
          if (msgs?.[0]) setError(field as keyof MemberFormValues, { message: msgs[0] });
        });
      }
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Guardado');
    onDone(result);
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="DNI / Documento" htmlFor="dni" error={errors.dni?.message}>
          <Input id="dni" inputMode="numeric" autoComplete="off" aria-invalid={!!errors.dni} {...register('dni')} />
        </Field>
        <Field label="Género" htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...register('gender')}>
            <option value="">Sin especificar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="O">Otro</option>
          </Select>
        </Field>
        <Field label="Nombres" htmlFor="first_name" error={errors.first_name?.message}>
          <Input id="first_name" aria-invalid={!!errors.first_name} {...register('first_name')} />
        </Field>
        <Field label="Apellidos" htmlFor="last_name" error={errors.last_name?.message}>
          <Input id="last_name" aria-invalid={!!errors.last_name} {...register('last_name')} />
        </Field>
        <Field label="Teléfono / WhatsApp" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" inputMode="tel" placeholder="+51 9XX XXX XXX" aria-invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <Field label="Correo" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Fecha de nacimiento" htmlFor="birth_date" error={errors.birth_date?.message}>
          <Input id="birth_date" type="date" {...register('birth_date')} />
        </Field>
        <Field label="Entrenador asignado" htmlFor="trainer_id" error={errors.trainer_id?.message}>
          <Select id="trainer_id" {...register('trainer_id')}>
            <option value="">Sin asignar</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Contacto de emergencia" htmlFor="emergency_contact" error={errors.emergency_contact?.message}>
        <Input id="emergency_contact" placeholder="Nombre y teléfono" {...register('emergency_contact')} />
      </Field>
      <Field
        label="Restricciones médicas"
        htmlFor="medical_notes"
        error={errors.medical_notes?.message}
        hint="Lesiones, alergias o condiciones. Se muestra al entrenador y en recepción."
      >
        <Textarea id="medical_notes" {...register('medical_notes')} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
