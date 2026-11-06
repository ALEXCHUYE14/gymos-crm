'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { whatsappUrl } from '@/lib/utils';
import { useCan, useSession } from '@/stores/session-store';
import type { Member } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { setPortalAccess } from './actions';

export function PortalAccessModal({ member, open, onClose }: { member: Member; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const can = useCan();
  const { settings } = useSession();
  const [token, setToken] = useState<string | null | undefined>(member.portal_token);
  const [origin, setOrigin] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setToken(member.portal_token), [member.portal_token]);

  const canManage = can('members', 'update');
  const url = token ? `${origin}/p/${token}` : '';
  const wa = token
    ? whatsappUrl(
        member.phone,
        `Hola ${member.first_name}, este es tu portal de ${settings.name}: ahí tienes tu QR de ingreso, tu membresía, tu rutina y la reserva de clases. Guárdalo en tu celular: ${url}`,
      )
    : null;

  const run = (mode: 'enable' | 'rotate' | 'disable') =>
    startTransition(async () => {
      const res = await setPortalAccess({ id: member.id, mode });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setToken(res.data.token);
      toast.success(res.message ?? 'Actualizado');
      router.refresh();
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el enlace y cópialo manualmente.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Portal del socio" description={`${member.first_name} ${member.last_name}`} size="md">
      {token === undefined ? (
        <p className="text-sm text-muted">
          Para usar el portal, un administrador debe ejecutar la migración 0006 en Supabase.
        </p>
      ) : token === null ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Con su enlace personal, el socio ve su QR de ingreso, el estado de su membresía y su rutina, y reserva clases desde
            el celular. No necesita usuario ni contraseña.
          </p>
          {canManage ? (
            <Button onClick={() => run('enable')} loading={pending}>
              Activar portal
            </Button>
          ) : (
            <p className="text-muted">Pide a un administrador que active el portal para este socio.</p>
          )}
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div>
            <label htmlFor="portal-url" className="mb-1.5 block text-xs font-medium text-muted">
              Enlace personal
            </label>
            <div className="flex gap-2">
              <Input id="portal-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar enlace">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Cualquiera con este enlace puede ver los datos del socio y reservar a su nombre. Compártelo solo con él.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-olive px-4 font-medium text-olive-fg hover:bg-olive/90"
              >
                <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
              </a>
            ) : (
              <span className="self-center text-muted">Registra su teléfono para enviárselo por WhatsApp.</span>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 font-medium hover:bg-surface-2"
            >
              <ExternalLink className="h-4 w-4" /> Abrir
            </a>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="outline" size="sm" onClick={() => run('rotate')} disabled={pending}>
                <RefreshCw className="h-3.5 w-3.5" /> Generar enlace nuevo
              </Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => run('disable')} disabled={pending}>
                Desactivar portal
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
