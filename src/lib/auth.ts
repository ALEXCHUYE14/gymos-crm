import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { BusinessSettings, ProfileWithRole } from '@/types/database';
import {
  isAppModule,
  isPermAction,
  permissionKey,
  type AppModule,
  type PermAction,
  type PermissionKey,
} from '@/types/permissions';

export interface SessionContext {
  userId: string;
  profile: ProfileWithRole;
  permissions: PermissionKey[];
  settings: BusinessSettings;
}

/** Contexto de sesión memoizado por request. Devuelve null si no hay sesión válida. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, permsRes, settingsRes] = await Promise.all([
    supabase.from('profiles').select('*, role:roles(id, key, name)').eq('id', user.id).single(),
    supabase.rpc('get_my_permissions'),
    supabase.from('business_settings').select('*').eq('id', 1).single(),
  ]);

  if (profileRes.error || !profileRes.data || settingsRes.error || !settingsRes.data) return null;

  const rows = (permsRes.data ?? []) as Array<{ module: string; action: string }>;
  const permissions = rows
    .filter((r) => isAppModule(r.module) && isPermAction(r.action))
    .map((r) => permissionKey(r.module as AppModule, r.action as PermAction));

  return {
    userId: user.id,
    profile: profileRes.data as ProfileWithRole,
    permissions,
    settings: settingsRes.data as BusinessSettings,
  };
});

export function hasPermission(ctx: SessionContext, module: AppModule, action: PermAction) {
  return ctx.permissions.includes(permissionKey(module, action));
}

/** Guardia para páginas: redirige si no hay sesión o falta el permiso. */
export async function requirePermission(module: AppModule, action: PermAction): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!ctx.profile.active) redirect('/login?error=inactive');
  if (!hasPermission(ctx, module, action)) redirect('/forbidden');
  return ctx;
}

/** Guardia para Server Actions: devuelve el contexto o un mensaje de error (no redirige). */
export async function authorizeAction(
  module: AppModule,
  action: PermAction,
): Promise<{ ctx: SessionContext; error: null } | { ctx: null; error: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.profile.active) return { ctx: null, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  if (!hasPermission(ctx, module, action)) return { ctx: null, error: 'No tienes permiso para realizar esta acción.' };
  return { ctx, error: null };
}
