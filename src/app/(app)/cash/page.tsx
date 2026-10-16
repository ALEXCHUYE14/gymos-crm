import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { CashRegister, CashSummary } from '@/types/database';
import { PageHeader } from '@/components/ui/card';
import { CashManager, type RegisterRow } from '@/features/cash/cash-manager';

export const metadata: Metadata = { title: 'Caja' };

export default async function CashPage() {
  const ctx = await requirePermission('pos', 'read');
  const supabase = await getSupabaseServer();

  const [openRes, historyRes] = await Promise.all([
    supabase.from('cash_register').select('*').eq('opened_by', ctx.userId).eq('status', 'open').maybeSingle(),
    supabase
      .from('cash_register')
      .select('*, cashier:profiles!cash_register_opened_by_fkey(full_name)')
      .order('opened_at', { ascending: false })
      .limit(40),
  ]);

  const open = (openRes.data ?? null) as CashRegister | null;
  let summary: CashSummary | null = null;
  if (open) {
    const { data } = await supabase.rpc('cash_register_summary', { p_register_id: open.id });
    summary = (data ?? null) as CashSummary | null;
  }

  return (
    <>
      <PageHeader title="Caja" description="Apertura, arqueo y cierre por turno y cajero" />
      <CashManager openRegister={open} summary={summary} history={(historyRes.data ?? []) as RegisterRow[]} />
    </>
  );
}
