'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';

let browserClient: SupabaseClient | undefined;

/** Cliente singleton para componentes de cliente. Toda consulta pasa por RLS. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = getPublicEnv();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
