import type { Metadata, Viewport } from 'next';
import { cache } from 'react';
import { Link2Off } from 'lucide-react';
import { getSupabaseAnon } from '@/lib/supabase/anon';
import { brandingPublicUrl } from '@/lib/storage';
import { PortalView } from '@/features/portal/portal-view';
import type { PortalData } from '@/types/database';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

type PortalResult = { status: 'ok'; data: PortalData } | { status: 'invalid' } | { status: 'unavailable' };

// cache: generateMetadata y la página comparten una sola llamada por visita
const getPortal = cache(async (token: string): Promise<PortalResult> => {
  if (!TOKEN_RE.test(token)) return { status: 'invalid' };
  try {
    const { data, error } = await getSupabaseAnon().rpc('portal_get', { p_token: token });
    // Migración 0006 sin ejecutar o fallo de red: no es culpa del enlace
    if (error) return { status: 'unavailable' };
    return data ? { status: 'ok', data: data as PortalData } : { status: 'invalid' };
  } catch {
    return { status: 'unavailable' };
  }
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const portal = await getPortal(token);
  const name = portal.status === 'ok' ? portal.data.business.name : 'Mi gimnasio';
  return {
    title: { absolute: name },
    // Sin enlace válido no se ofrece instalar la app
    manifest: portal.status === 'ok' ? `/p/${token}/manifest.webmanifest` : undefined,
    appleWebApp: portal.status === 'ok' ? { capable: true, title: name, statusBarStyle: 'default' } : undefined,
    referrer: 'no-referrer',
  };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await getPortal(token);

  if (portal.status !== 'ok') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-center text-ink">
        <div className="max-w-sm">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Link2Off className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {portal.status === 'invalid' ? 'Este enlace ya no funciona' : 'Portal no disponible'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {portal.status === 'invalid'
              ? 'Puede que el gimnasio haya generado uno nuevo. Pide tu enlace actualizado en recepción.'
              : 'No pudimos cargar tu información en este momento. Inténtalo de nuevo en unos minutos.'}
          </p>
        </div>
      </main>
    );
  }

  const logoUrl = brandingPublicUrl(getSupabaseAnon(), portal.data.business.logo_path);
  // `now` fijo desde el servidor: "Hoy/Mañana" y "En curso" se calculan igual en servidor y navegador
  return <PortalView token={token} data={portal.data} logoUrl={logoUrl} now={Date.now()} />;
}
