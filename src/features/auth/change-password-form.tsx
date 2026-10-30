'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { newPasswordSchema, type NewPasswordInput } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';

export function ChangePasswordForm({ recovery }: { recovery: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = async ({ password }: NewPasswordInput) => {
    const { error } = await getSupabaseBrowser().auth.updateUser({ password });
    if (error) {
      toast.error(
        error.code === 'same_password' ? 'La nueva contraseña debe ser distinta de la actual' : error.message,
      );
      return;
    }
    reset();
    toast.success('Contraseña actualizada');
    if (recovery) router.replace('/dashboard');
  };

  return (
    <Card className="max-w-lg">
      <CardHeader
        title={recovery ? 'Define tu nueva contraseña' : 'Cambiar contraseña'}
        description="Mínimo 10 caracteres, con mayúscula, minúscula y número."
      />
      <CardBody>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Nueva contraseña" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <Field label="Repite la contraseña" htmlFor="confirm" error={errors.confirm?.message}>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...register('confirm')}
            />
          </Field>
          <Button type="submit" loading={isSubmitting}>
            {!isSubmitting && <KeyRound className="h-4 w-4" />}
            Guardar contraseña
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
