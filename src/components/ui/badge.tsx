import type { ReactNode } from 'react';
import { cn, STATUS_LABELS } from '@/lib/utils';
import type { MembershipStatus } from '@/types/database';

type Tone = 'neutral' | 'olive' | 'copper' | 'ok' | 'warn' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  olive: 'bg-olive-soft text-olive border-olive/20',
  copper: 'bg-copper-soft text-copper border-copper/20',
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/25',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<MembershipStatus, Tone> = {
  active: 'ok',
  frozen: 'copper',
  expired: 'neutral',
  debtor: 'danger',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: MembershipStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
