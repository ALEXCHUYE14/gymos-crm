import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/ui/card';
import { ReportsView } from '@/features/reports/reports-view';

export const metadata: Metadata = { title: 'Reportes' };

export default async function ReportsPage() {
  await requirePermission('finances', 'read');
  return (
    <>
      <PageHeader title="Reportes financieros" description="Ingresos diarios y mensuales por método de pago y tipo de venta" />
      <ReportsView />
    </>
  );
}
