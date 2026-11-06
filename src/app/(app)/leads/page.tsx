import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { isMissingSchemaError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getTrainers } from '@/features/members/queries';
import { LeadsManager } from '@/features/leads/leads-manager';
import { MigrationNotice } from '@/components/layout/migration-notice';
import { PageHeader } from '@/components/ui/card';
import type { Lead } from '@/types/database';

export const metadata: Metadata = { title: 'Prospectos' };

const MAX_LEADS = 1000;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del gimnasio. */
function businessToday(timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function LeadsPage() {
  const ctx = await requirePermission('members', 'read');
  const supabase = await getSupabaseServer();
  const [leadsRes, trainers] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(MAX_LEADS),
    getTrainers(),
  ]);

  if (leadsRes.error && isMissingSchemaError(leadsRes.error)) {
    return (
      <>
        <PageHeader title="Prospectos" />
        <MigrationNotice />
      </>
    );
  }

  return (
    <LeadsManager
      leads={(leadsRes.data ?? []) as Lead[]}
      trainers={trainers}
      today={businessToday(ctx.settings.timezone)}
      truncated={(leadsRes.data?.length ?? 0) >= MAX_LEADS}
      loadError={leadsRes.error ? 'No se pudieron cargar los prospectos. Recarga la página.' : null}
    />
  );
}
