'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/auth';
import { humanizeError } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseServer } from '@/lib/supabase/server';
import { inviteStaffSchema, permissionToggleSchema, zodFieldErrors } from '@/lib/validations';
import type { ActionResult } from '@/types/database';

export async function inviteStaff(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('staff', 'create');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos', fieldErrors: zodFieldErrors(parsed.error) };

  if (parsed.data.role_key === 'super_admin' && auth.ctx.profile.role?.key !== 'super_admin') {
    return { ok: false, error: 'Solo un Super Admin puede crear otro Super Admin' };
  }
  if (parsed.data.role_key === 'branch_admin' && auth.ctx.profile.role?.key !== 'super_admin') {
    return { ok: false, error: 'Solo un Super Admin puede crear administradores de sucursal' };
  }

  // El rol viaja en app_metadata (solo escribible con service_role); el trigger handle_new_user lo aplica.
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
    app_metadata: { role_key: parsed.data.role_key },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.toLowerCase().includes('already') ? 'Ya existe un usuario con ese correo' : error.message,
    };
  }

  revalidatePath('/staff');
  return { ok: true, data: undefined, message: 'Usuario creado. Comparte la contraseña temporal por un canal seguro.' };
}

export async function updateStaff(userId: unknown, input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('staff', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const parsed = z
    .object({
      userId: z.string().uuid(),
      role_id: z.string().uuid().optional(),
      active: z.boolean().optional(),
      full_name: z.string().trim().min(3).max(100).optional(),
    })
    .safeParse({ userId, ...(typeof input === 'object' && input ? input : {}) });
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida' };
  if (parsed.data.userId === auth.ctx.userId && (parsed.data.role_id || parsed.data.active !== undefined)) {
    return { ok: false, error: 'No puedes cambiar tu propio rol o estado' };
  }

  const { userId: id, ...changes } = parsed.data;
  const supabase = await getSupabaseServer();
  // El trigger guard_profile_update vuelve a validar escalamiento de privilegios en la base de datos.
  const { error } = await supabase.from('profiles').update(changes).eq('id', id);
  if (error) return { ok: false, error: humanizeError(error) };

  revalidatePath('/staff');
  return { ok: true, data: undefined, message: 'Personal actualizado' };
}

export async function toggleRolePermission(roleId: unknown, input: unknown, granted: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('staff', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const role = z.string().uuid().safeParse(roleId);
  const perm = permissionToggleSchema.safeParse(input);
  const g = z.boolean().safeParse(granted);
  if (!role.success || !perm.success || !g.success) return { ok: false, error: 'Solicitud inválida' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_role_permission', {
    p_role_id: role.data,
    p_module: perm.data.module,
    p_action: perm.data.action,
    p_granted: g.data,
  });
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

export async function setUserOverride(userId: unknown, input: unknown, granted: unknown): Promise<ActionResult> {
  const auth = await authorizeAction('staff', 'update');
  if (!auth.ctx) return { ok: false, error: auth.error };
  const user = z.string().uuid().safeParse(userId);
  const perm = permissionToggleSchema.safeParse(input);
  const g = z.boolean().nullable().safeParse(granted);
  if (!user.success || !perm.success || !g.success) return { ok: false, error: 'Solicitud inválida' };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('set_user_override', {
    p_user_id: user.data,
    p_module: perm.data.module,
    p_action: perm.data.action,
    p_granted: g.data,
  });
  if (error) return { ok: false, error: humanizeError(error) };
  revalidatePath('/staff');
  return { ok: true, data: undefined };
}
