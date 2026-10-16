import 'server-only';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Personal con rol de entrenador (visible si el usuario puede leer perfiles). */
export async function getTrainers(): Promise<Array<{ id: string; full_name: string }>> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role:roles!inner(key)')
    .eq('active', true)
    .in('role.key', ['trainer', 'branch_admin', 'super_admin'])
    .order('full_name');
  return ((data ?? []) as Array<{ id: string; full_name: string }>).map(({ id, full_name }) => ({ id, full_name }));
}
