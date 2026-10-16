import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth';
import { getTrainers } from '@/features/members/queries';
import { PageHeader } from '@/components/ui/card';
import { MembersTable } from '@/features/members/members-table';

export const metadata: Metadata = { title: 'Socios' };

export default async function MembersPage() {
  await requirePermission('members', 'read');
  const trainers = await getTrainers();
  return (
    <>
      <PageHeader title="Socios" description="Gestión 360° de clientes, estados de membresía y datos de salud" />
      <Suspense>
        <MembersTable trainers={trainers} />
      </Suspense>
    </>
  );
}
