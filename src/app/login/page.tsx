import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/login-form';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';
import { brandingPublicUrl } from '@/lib/storage';
import loginBackground from '@/assets/brand/login-bg.jpg';
import defaultLogo from '@/assets/brand/logo-circle.webp';

export const metadata: Metadata = { title: 'Iniciar sesión' };
// El logo puede cambiarse desde Ajustes: se lee en cada visita
export const dynamic = 'force-dynamic';

/**
 * El login es público y `business_settings` solo es legible por usuarios autenticados (RLS),
 * así que se usa la RPC `login_branding()` (migración 0004), que expone solo nombre y logo.
 * Si falla (migración sin ejecutar, sin red), se usa la marca predeterminada: el login nunca se rompe.
 */
async function getLoginBranding(): Promise<{ name: string | null; logoUrl: string | null }> {
  try {
    const { url, anonKey } = getPublicEnv();
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc('login_branding');
    if (error || !data) return { name: null, logoUrl: null };
    const branding = data as { name: string | null; logo_path: string | null };
    return { name: branding.name ?? null, logoUrl: brandingPublicUrl(supabase, branding.logo_path) };
  } catch {
    return { name: null, logoUrl: null };
  }
}

export default async function LoginPage() {
  const { name, logoUrl } = await getLoginBranding();
  const businessName = name ?? 'GymOS';

  return (
    // `dark` fuerza la paleta oscura en el formulario, sin importar el tema elegido por el usuario
    <main className="dark relative isolate flex min-h-dvh flex-col bg-[#0b0c0d] text-ink">
      {/* Fondo fijo: se mantiene al hacer scroll en pantallas bajas (móvil horizontal) */}
      <div className="fixed inset-0 -z-10" aria-hidden>
        <Image
          src={loginBackground}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          quality={80}
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/35 to-black/75" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.5)_80%)]" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
        <div className="w-full max-w-[420px] animate-pop-in">
          {/* Vidrio transparente: el gimnasio se ve detrás de la tarjeta, con un leve desenfoque para que el texto se lea */}
          <div
            className="relative mt-16 rounded-3xl border border-white/15 px-5 pb-7 pt-20 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_30px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md backdrop-saturate-150 sm:mt-20 sm:px-9 sm:pb-9 sm:pt-24"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 45%), rgba(6,7,9,0.42)' }}
          >
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-black bg-[#16191d] shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_18px_40px_-10px_rgba(0,0,0,0.95)] sm:h-32 sm:w-32">
                {logoUrl ? (
                  // Logo subido desde Ajustes (bucket público). Fondo blanco, igual que su vista previa en Ajustes.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={businessName} className="h-full w-full bg-white object-contain p-4" />
                ) : (
                  <Image src={defaultLogo} alt={businessName} priority sizes="128px" className="h-full w-full object-cover" />
                )}
              </div>
            </div>

            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Bienvenido</h1>
              {name && (
                <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#d4a63a]">{businessName}</p>
              )}
              <p className="mt-3 text-sm text-white/60">Ingresa con la cuenta que te asignó el administrador.</p>
            </div>

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-xs text-white/45">
            Acceso restringido a personal autorizado · © {new Date().getFullYear()} {businessName}
          </p>
        </div>
      </div>
    </main>
  );
}
