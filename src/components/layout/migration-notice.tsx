import { DatabaseZap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';

/** Se muestra cuando una función nueva necesita una migración que aún no se ejecutó en Supabase. */
export function MigrationNotice({ migration = '0006_portal_leads_retention.sql' }: { migration?: string }) {
  return (
    <Card>
      <EmptyState
        icon={DatabaseZap}
        title="Falta actualizar la base de datos"
        description={`Un administrador debe ejecutar el archivo supabase/migrations/${migration} en Supabase → SQL Editor. Después recarga esta página.`}
      />
    </Card>
  );
}
