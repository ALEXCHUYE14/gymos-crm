'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Algo salió mal"
        description={
          error.digest
            ? `No pudimos cargar esta sección. Código de referencia: ${error.digest}`
            : 'No pudimos cargar esta sección. Intenta nuevamente.'
        }
        action={<Button onClick={reset}>Reintentar</Button>}
      />
    </Card>
  );
}
