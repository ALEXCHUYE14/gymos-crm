'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { cn } from '@/lib/utils';

function safeNext(next: string | null) {
  // Evita open redirects: solo rutas internas
  // (el navegador trata "\" como "/", así que "/\evil.com" equivale a "//evil.com")
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/dashboard';
  return next;
}

// text-base (16px) evita el zoom automático de iOS al enfocar el campo
const INPUT_CLASS =
  'h-12 border-white/15 bg-white/[0.06] text-base text-white placeholder:text-white/40 focus:border-[#d4a63a] focus:bg-black/30 focus:ring-[#d4a63a]/25';

const LOGIN_ERRORS: Record<string, string> = {
  inactive: 'Tu cuenta está desactivada o no tiene un rol asignado. Contacta al administrador.',
  session: 'No se pudo cargar tu perfil. Vuelve a iniciar sesión o contacta al administrador.',
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    const message = LOGIN_ERRORS[params.get('error') ?? ''];
    if (message) {
      toast.error(message);
      void getSupabaseBrowser().auth.signOut();
    }
  }, [params]);

  const onSubmit = async (values: LoginInput) => {
    const { error } = await getSupabaseBrowser().auth.signInWithPassword(values);
    if (error) {
      toast.error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message);
      return;
    }
    router.replace(safeNext(params.get('next')));
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
      <Field label="Correo" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          aria-invalid={!!errors.email}
          className={INPUT_CLASS}
          {...register('email')}
        />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            placeholder="••••••••"
            className={cn(INPUT_CLASS, 'pr-12')}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/50 hover:text-white"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        className="mt-2 w-full bg-[#d4a63a] font-semibold uppercase tracking-[0.14em] text-[#16130b] shadow-lg shadow-[#d4a63a]/20 hover:bg-[#e2b752] focus-visible:ring-[#d4a63a] focus-visible:ring-offset-[#101214]"
      >
        {!isSubmitting && <LogIn className="h-4 w-4" />}
        Ingresar
      </Button>
    </form>
  );
}
