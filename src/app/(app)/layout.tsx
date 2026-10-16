import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { brandingPublicUrl } from '@/lib/storage';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!ctx.profile.active) redirect('/login?error=inactive');

  const supabase = await getSupabaseServer();
  const logoUrl = brandingPublicUrl(supabase, ctx.settings.logo_path);
  const paymentQrUrl = brandingPublicUrl(supabase, ctx.settings.payment_qr_path);

  return (
    <AppShell
      profile={ctx.profile}
      permissions={ctx.permissions}
      settings={ctx.settings}
      logoUrl={logoUrl}
      paymentQrUrl={paymentQrUrl}
    >
      {children}
    </AppShell>
  );
}
