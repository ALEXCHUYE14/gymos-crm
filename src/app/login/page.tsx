import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Dumbbell } from 'lucide-react';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#161718] p-12 text-[#e8e8e2] lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #a0b26c 0 1px, transparent 1px 22px), repeating-linear-gradient(45deg, #d69266 0 1px, transparent 1px 44px)',
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#a0b26c] text-[#14160e]">
            <Dumbbell className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">GymOS</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight tracking-tight">
            Operación de recepción, caja y socios en un solo lugar.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#a0a4a2]">
            Control de acceso en milisegundos, arqueos por turno y permisos granulares por rol. Cada acción queda
            protegida por políticas a nivel de fila en la base de datos.
          </p>
        </div>
        <p className="relative text-xs text-[#7d817f]">Acceso restringido a personal autorizado.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-olive text-olive-fg">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-muted">Ingresa con la cuenta que te asignó el administrador.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
