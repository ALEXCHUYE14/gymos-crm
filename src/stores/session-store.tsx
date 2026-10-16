'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BusinessSettings, ProfileWithRole } from '@/types/database';
import { permissionKey, type AppModule, type PermAction, type PermissionKey } from '@/types/permissions';

/**
 * Sesión por request vía React Context (no un store global de módulo), para que
 * en SSR nunca se mezclen permisos entre usuarios concurrentes.
 */
interface SessionValue {
  profile: ProfileWithRole;
  permissions: Set<PermissionKey>;
  settings: BusinessSettings;
  logoUrl: string | null;
  paymentQrUrl: string | null;
  setSettings: (settings: BusinessSettings, urls?: { logoUrl?: string | null; paymentQrUrl?: string | null }) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  children,
  profile,
  permissions,
  settings: initialSettings,
  logoUrl: initialLogo,
  paymentQrUrl: initialQr,
}: {
  children: ReactNode;
  profile: ProfileWithRole;
  permissions: PermissionKey[];
  settings: BusinessSettings;
  logoUrl: string | null;
  paymentQrUrl: string | null;
}) {
  const [settings, setSettingsState] = useState(initialSettings);
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [paymentQrUrl, setPaymentQrUrl] = useState(initialQr);
  const permSet = useMemo(() => new Set(permissions), [permissions]);

  const setSettings = useCallback<SessionValue['setSettings']>((next, urls) => {
    setSettingsState(next);
    if (urls?.logoUrl !== undefined) setLogoUrl(urls.logoUrl);
    if (urls?.paymentQrUrl !== undefined) setPaymentQrUrl(urls.paymentQrUrl);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ profile, permissions: permSet, settings, logoUrl, paymentQrUrl, setSettings }),
    [profile, permSet, settings, logoUrl, paymentQrUrl, setSettings],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}

/** Autorización para la UI. La seguridad real la imponen RLS y las RPC en la base de datos. */
export function useCan() {
  const { permissions } = useSession();
  return useCallback(
    (module: AppModule, action: PermAction) => permissions.has(permissionKey(module, action)),
    [permissions],
  );
}

export function useCurrency() {
  return useSession().settings.currency;
}
