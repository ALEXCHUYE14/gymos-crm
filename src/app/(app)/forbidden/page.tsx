import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';
import { Card } from '@/components/ui/card';

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState
        icon={ShieldOff}
        title="Acceso restringido"
        description="Tu rol no tiene permiso para ver este módulo. Si crees que es un error, pide al administrador que revise tu matriz de permisos."
        action={
          <Link href="/dashboard" className="text-sm font-medium text-olive underline-offset-4 hover:underline">
            Volver al inicio
          </Link>
        }
      />
    </Card>
  );
}
