import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Currency, MembershipStatus, PaymentMethod, PlanKind } from '@/types/database';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_CODE: Record<Currency, string> = { 'S/': 'PEN', $: 'USD', '€': 'EUR' };

export function formatMoney(value: number | string | null | undefined, currency: Currency = 'S/') {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  const formatted = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
  return `${currency} ${formatted}`;
}

export function currencyCode(currency: Currency) {
  return CURRENCY_CODE[currency];
}

/** Las fechas "YYYY-MM-DD" se tratan como fecha local (no UTC) para evitar desfases. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  const date = typeof value === 'string' && value.length === 10 ? parseDateOnly(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', opts ?? { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Activa',
  frozen: 'Congelada',
  expired: 'Vencida',
  debtor: 'Deudor',
  cancelled: 'Anulada',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  wallet: 'Billetera móvil',
};

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  daily: 'Pase diario',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  class_pack: 'Clases grupales',
};

/** Escapa caracteres especiales para filtros `ilike` / `or` de PostgREST. */
export function sanitizeSearch(term: string) {
  return term.replace(/[%_,().*\\]/g, ' ').trim().slice(0, 60);
}
