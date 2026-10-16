import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Plan, Product } from '@/types/database';
import { PageHeader } from '@/components/ui/card';
import { PosTerminal } from '@/features/pos/pos-terminal';

export const metadata: Metadata = { title: 'Punto de venta' };

export default async function PosPage() {
  await requirePermission('pos', 'create');
  const supabase = await getSupabaseServer();
  const [registerRes, productsRes, plansRes] = await Promise.all([
    supabase.rpc('my_open_register'),
    supabase.from('products').select('*').eq('active', true).order('category').order('name'),
    supabase.from('plans').select('*').eq('active', true).order('price'),
  ]);

  return (
    <>
      <PageHeader title="Punto de venta" description="Venta rápida de barra y cobro de membresías" />
      <PosTerminal
        hasOpenRegister={!!registerRes.data}
        products={(productsRes.data ?? []) as Product[]}
        plans={(plansRes.data ?? []) as Plan[]}
      />
    </>
  );
}
