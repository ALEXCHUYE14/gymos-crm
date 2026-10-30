import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/card';
import { ChangePasswordForm } from '@/features/auth/change-password-form';

export const metadata: Metadata = { title: 'Mi cuenta' };

// Sin requirePermission: cualquier usuario activo puede cambiar su propia contraseña (el layout ya exige sesión)
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const { recovery } = await searchParams;
  return (
    <>
      <PageHeader title="Mi cuenta" description="Cambia la contraseña con la que ingresas al sistema" />
      <ChangePasswordForm recovery={recovery === '1'} />
    </>
  );
}
