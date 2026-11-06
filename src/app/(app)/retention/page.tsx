import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { isMissingSchemaError } from '@/lib/errors';
import { getSupabaseServer } from '@/lib/supabase/server';
import { RetentionView } from '@/features/retention/retention-view';
import { MigrationNotice } from '@/components/layout/migration-notice';
import { Card, PageHeader } from '@/components/ui/card';
import type { RetentionOverview } from '@/types/database';

export const metadata: Metadata = { title: 'Retención' };

const DAY_OPTIONS = [7, 14, 21, 30] as const;

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requirePermission('members', 'read');
  const { dias } = await searchParams;
  const days = DAY_OPTIONS.find((d) => String(d) === dias) ?? 14;

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('retention_overview', { p_inactive_days: days });

  if (error) {
    return (
      <>
        <PageHeader title="Retención" />
        {isMissingSchemaError(error) ? (
          <MigrationNotice />
        ) : (
          <Card className="p-5 text-sm text-danger">No se pudo cargar la información. Recarga la página.</Card>
        )}
      </>
    );
  }

  return <RetentionView data={data as RetentionOverview} days={days} dayOptions={[...DAY_OPTIONS]} />;
}
