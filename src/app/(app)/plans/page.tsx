import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Plan } from '@/types/database';
import { PageHeader } from '@/components/ui/card';
import { PlansManager } from '@/features/settings/plans-manager';

export const metadata: Metadata = { title: 'Planes' };

export default async function PlansPage() {
  await requirePermission('settings', 'read');
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from('plans').select('*').order('active', { ascending: false }).order('price');
  return (
    <>
      <PageHeader title="Planes y membresías" description="Catálogo de pases, mensualidades y paquetes de clases grupales" />
      <PlansManager plans={(data ?? []) as Plan[]} />
    </>
  );
}
