'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { forgotPasswordSchema, loginSchema, type ForgotPasswordInput, type LoginInput } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { cn } from '@/lib/utils';

function safeNext(next: string | null) {
  // Evita open redirects: solo rutas internas
  // (el navegador trata "\" como "/", así que "/\evil.com" equivale a "//evil.com")
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/dashboard';
  return next;
}

// text-base (16px) evita el zoom automático de iOS al enfocar el campo
const INPUT_CLASS = 'h-12 rounded-xl bg-canvas px-4 text-base focus:bg-surface';
const SUBMIT_CLASS = 'h-12 w-full rounded-xl text-[15px] font-semibold';
const LINK_CLASS =
  'rounded-sm text-sm font-medium text-olive underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive';

const LOGIN_ERRORS: Record<string, string> = {
  inactive: 'Tu cuenta está desactivada o no tiene un rol asignado. Contacta al administrador.',
  session: 'No se pudo cargar tu perfil. Vuelve a iniciar sesión o contacta al administrador.',
  recovery: 'El enlace de recuperación expiró o se abrió en otro navegador. Solicita uno nuevo.',
};

function Heading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
    </header>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);
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

  if (forgot) return <ForgotPasswordForm onBack={() => setForgot(false)} />;

  return (
    <>
      <Heading title="Inicia sesión" description="Usa el correo y la contraseña que te asignó el administrador." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
            Correo
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="nombre@correo.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={INPUT_CLASS}
            {...register('email')}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Contraseña
            </label>
            <button type="button" onClick={() => setForgot(true)} className={LINK_CLASS}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={cn(INPUT_CLASS, 'pr-12')}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-olive"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className={cn(SUBMIT_CLASS, 'mt-2')}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }: ForgotPasswordInput) => {
    const { error } = await getSupabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    // Mismo mensaje exista o no la cuenta (no revela qué correos están registrados); solo se avisa el límite de envíos
    if (error?.status === 429) {
      toast.error('Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.');
      return;
    }
    setSentTo(email);
  };

  const back = (
    <button type="button" onClick={onBack} className={cn(LINK_CLASS, 'mt-6 inline-flex items-center gap-1.5')}>
      <ArrowLeft className="h-4 w-4" />
      Volver a iniciar sesión
    </button>
  );

  if (sentTo) {
    return (
      <>
        <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-olive-soft text-olive">
          <MailCheck className="h-6 w-6" />
        </span>
        <Heading
          title="Revisa tu correo"
          description={
            <>
              Si <span className="font-medium text-ink">{sentTo}</span> pertenece a una cuenta del personal, recibirás un
              enlace para crear una nueva contraseña. Ábrelo en este mismo navegador.
            </>
          }
        />
        {back}
      </>
    );
  }

  return (
    <>
      <Heading
        title="Recupera tu acceso"
        description="Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña."
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div>
          <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-ink">
            Correo
          </label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="nombre@correo.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'forgot-email-error' : undefined}
            className={INPUT_CLASS}
            {...register('email')}
          />
          <FieldError id="forgot-email-error" message={errors.email?.message} />
        </div>
        <Button type="submit" size="lg" loading={isSubmitting} className={SUBMIT_CLASS}>
          {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
        </Button>
      </form>
      {back}
    </>
  );
}
