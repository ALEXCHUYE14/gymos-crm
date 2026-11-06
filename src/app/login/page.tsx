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

// Soporte técnico del sistema (WhatsApp)
const SUPPORT_WHATSAPP = '51924996961';

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

function BrandLogo({ logoUrl, name, className }: { logoUrl: string | null; name: string; className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-full ring-1 ring-white/20 ${className ?? ''}`}>
      {logoUrl ? (
        // Logo subido desde Ajustes (bucket público). Fondo blanco, igual que su vista previa en Ajustes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-full w-full bg-white object-contain p-1.5" />
      ) : (
        <Image src={defaultLogo} alt={name} priority sizes="64px" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

export default async function LoginPage() {
  const { name, logoUrl } = await getLoginBranding();
  const businessName = name ?? 'GymOS';
  const supportUrl = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    `Hola, tengo problemas para acceder al sistema de ${businessName}.`,
  )}`;

  return (
    <main className="min-h-dvh bg-surface text-ink lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(460px,1fr)]">
      {/* Imagen del gimnasio: franja superior en móvil, mitad izquierda en escritorio */}
      <section className="relative isolate h-[34dvh] min-h-[220px] overflow-hidden bg-black lg:sticky lg:top-0 lg:h-dvh">
        <Image
          src={loginBackground}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1024px) 55vw, 100vw"
          quality={80}
          className="-z-10 object-cover object-[50%_60%]"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/30 to-black/40" aria-hidden />

        <div className="flex h-full flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-8 lg:p-12">
          <div className="flex items-center gap-3">
            <BrandLogo logoUrl={logoUrl} name={businessName} className="h-10 w-10 lg:h-11 lg:w-11" />
            <span className="font-display text-base font-semibold text-white">{businessName}</span>
          </div>
          <div className="hidden max-w-xl lg:block">
            <p className="font-display text-[clamp(2.5rem,4.2vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-white text-balance">
              Cada ingreso, venta y membresía, bajo control.
            </p>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              Panel de gestión para el equipo de {businessName}.
            </p>
          </div>
        </div>
      </section>

      {/* Panel de acceso: en móvil sube sobre la imagen como una hoja */}
      <section className="relative z-10 -mt-6 flex min-h-[calc(66dvh+1.5rem)] flex-col rounded-t-3xl bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-9 sm:px-10 lg:mt-0 lg:min-h-dvh lg:rounded-none lg:px-16 lg:pt-12">
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
          <Suspense>
            <LoginForm />
          </Suspense>

          <p className="mt-10 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-6 text-sm text-muted">
            <span>¿Problemas para acceder?</span>
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm font-semibold text-olive underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Contactar soporte
            </a>
          </p>
        </div>

        <p className="mx-auto mt-10 w-full max-w-[400px] text-xs text-muted">
          © {new Date().getFullYear()} {businessName}. Acceso solo para personal autorizado.
        </p>
      </section>
    </main>
  );
}
