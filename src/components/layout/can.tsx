'use client';

import type { ReactNode } from 'react';
import { useCan } from '@/stores/session-store';
import type { AppModule, PermAction } from '@/types/permissions';

/** Renderiza `children` solo si la sesión activa tiene el permiso. */
export function Can({
  module,
  action,
  children,
  fallback = null,
}: {
  module: AppModule;
  action: PermAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useCan();
  return <>{can(module, action) ? children : fallback}</>;
}
