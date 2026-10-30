import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Destino del enlace de "Olvidé mi contraseña" (flujo PKCE de Supabase): canjea el código por una sesión
 * y lleva al usuario a Mi cuenta para que defina su nueva contraseña.
 * El enlace debe abrirse en el mismo navegador donde se pidió (ahí está guardado el code_verifier).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (code) {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/account?recovery=1`);
  }

  return NextResponse.redirect(`${origin}/login?error=recovery`);
}
