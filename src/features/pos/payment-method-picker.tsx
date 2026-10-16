'use client';

import { Banknote, CreditCard, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import { cn, PAYMENT_LABELS } from '@/lib/utils';
import type { PaymentMethod } from '@/types/database';
import { useSession } from '@/stores/session-store';

const ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  wallet: Smartphone,
};

export function PaymentMethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { paymentQrUrl } = useSession();
  return (
    <div>
      <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => {
          const Icon = ICONS[m];
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value === m}
              onClick={() => onChange(m)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors',
                value === m ? 'border-olive bg-olive-soft text-olive' : 'border-line text-muted hover:bg-surface-2',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {PAYMENT_LABELS[m]}
            </button>
          );
        })}
      </div>
      {(value === 'wallet' || value === 'transfer') && (
        <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-center">
          {paymentQrUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={paymentQrUrl} alt="Código QR de pago" className="mx-auto h-44 w-44 rounded-lg bg-white object-contain p-2" />
              <p className="mt-2 text-xs text-muted">Pide al cliente escanear y mostrar la confirmación antes de registrar.</p>
            </>
          ) : (
            <p className="text-xs text-muted">No hay un QR de pago configurado. Súbelo en Ajustes → Pasarela de pagos.</p>
          )}
        </div>
      )}
    </div>
  );
}
