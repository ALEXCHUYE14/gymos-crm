import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Product } from '@/types/database';
import { PageHeader } from '@/components/ui/card';
import { ProductsManager } from '@/features/pos/products-manager';

export const metadata: Metadata = { title: 'Productos' };

export default async function ProductsPage() {
  await requirePermission('pos', 'read');
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from('products').select('*').order('category').order('name');
  return (
    <>
      <PageHeader title="Productos" description="Inventario de barra con control de stock transaccional" />
      <ProductsManager products={(data ?? []) as Product[]} />
    </>
  );
}
