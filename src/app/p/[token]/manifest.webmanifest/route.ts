import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAnon } from '@/lib/supabase/anon';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** Manifiesto para instalar el portal como app: al abrirla, va directo al portal de ese socio. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  let name = 'Mi gimnasio';
  try {
    const { data } = await getSupabaseAnon().rpc('login_branding');
    const branding = data as { name?: string | null } | null;
    if (branding?.name) name = branding.name;
  } catch {
    // Sin marca: se usa el nombre genérico
  }

  const start = `/p/${token}`;
  return new NextResponse(
    JSON.stringify({
      name,
      short_name: name.slice(0, 12),
      description: `Tu acceso, membresía, rutina y clases en ${name}`,
      id: start,
      start_url: start,
      scope: start,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f4f3ef',
      theme_color: '#536032',
      lang: 'es',
      icons: [
        { src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
        { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}
