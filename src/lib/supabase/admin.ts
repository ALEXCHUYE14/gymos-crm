import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';

/**
 * Cliente con service_role: OMITE RLS. Usar solo en el servidor, después de
 * verificar permisos del usuario, para operaciones administrativas puntuales.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor');
  }
  const { url } = getPublicEnv();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
