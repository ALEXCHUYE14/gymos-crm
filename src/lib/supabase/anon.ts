import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';

/**
 * Cliente sin sesión (rol anon) para páginas públicas: login y portal del socio.
 * Solo puede llamar a las RPC concedidas explícitamente a anon (login_branding, portal_*).
 */
export function getSupabaseAnon(): SupabaseClient {
  const { url, anonKey } = getPublicEnv();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
