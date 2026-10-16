import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/ui/card';
import { CheckinTerminal } from '@/features/checkin/checkin-terminal';

export const metadata: Metadata = { title: 'Recepción' };

export default async function CheckinPage() {
  await requirePermission('checkin', 'create');
  return (
    <>
      <PageHeader title="Recepción" description="Control de acceso: verde autorizado · amarillo por vencer · rojo bloqueado" />
      <CheckinTerminal />
    </>
  );
}
