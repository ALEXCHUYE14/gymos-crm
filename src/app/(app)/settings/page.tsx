import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/card';
import { SettingsPanel, type NotificationLogRow } from '@/features/settings/settings-panel';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  await requirePermission('settings', 'read');
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('notification_log')
    .select('id, channel, status, error, created_at, member:members(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(8);

  return (
    <>
      <PageHeader title="Ajustes" description="Configuración global del negocio, identidad, cobros y automatización" />
      <SettingsPanel logs={(data ?? []) as unknown as NotificationLogRow[]} />
    </>
  );
}
