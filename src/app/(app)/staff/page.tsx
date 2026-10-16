import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Permission, ProfileWithRole, Role } from '@/types/database';
import { PageHeader } from '@/components/ui/card';
import { StaffManager } from '@/features/staff/staff-manager';

export const metadata: Metadata = { title: 'Personal y permisos' };

export default async function StaffPage() {
  const ctx = await requirePermission('staff', 'read');
  const supabase = await getSupabaseServer();
  const [profilesRes, rolesRes, permsRes, rolePermsRes, overridesRes] = await Promise.all([
    supabase.from('profiles').select('*, role:roles(id, key, name)').order('full_name'),
    supabase.from('roles').select('*').order('created_at'),
    supabase.from('permissions').select('*'),
    supabase.from('role_permissions').select('role_id, permission_id'),
    supabase.from('user_permission_overrides').select('user_id, permission_id, granted'),
  ]);

  return (
    <>
      <PageHeader title="Personal y permisos" description="Usuarios del sistema, roles y matriz de permisos granulares (RBAC)" />
      <StaffManager
        currentUserId={ctx.userId}
        currentRoleKey={ctx.profile.role?.key ?? null}
        staff={(profilesRes.data ?? []) as ProfileWithRole[]}
        roles={(rolesRes.data ?? []) as Role[]}
        permissions={(permsRes.data ?? []) as Permission[]}
        rolePermissions={(rolePermsRes.data ?? []) as Array<{ role_id: string; permission_id: string }>}
        overrides={(overridesRes.data ?? []) as Array<{ user_id: string; permission_id: string; granted: boolean }>}
      />
    </>
  );
}
