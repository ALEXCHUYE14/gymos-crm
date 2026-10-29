'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { exportToExcel, exportToPdf } from '@/lib/export';
import { humanizeError } from '@/lib/errors';
import { addDaysISO, formatDate, formatMoney, PAYMENT_LABELS, todayISO } from '@/lib/utils';
import { useCan, useSession } from '@/stores/session-store';
import type { PaymentMethod, RevenueRow } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatTile } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { fetchAllPages } from '@/lib/supabase/paginate';

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 6 },
  { label: '30 días', days: 29 },
  { label: '90 días', days: 89 },
];

const METHOD_COLOR: Record<PaymentMethod, string> = {
  cash: 'bg-olive',
  card: 'bg-copper',
  transfer: 'bg-ink/60',
  wallet: 'bg-warn',
};

export function ReportsView() {
  const can = useCan();
  const { settings } = useSession();
  const currency = settings.currency;
  const [from, setFrom] = useState(addDaysISO(todayISO(), -29));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (from > to) return;
    let cancelled = false;
    setLoading(true);
    // Un año con varios métodos de pago supera las 1000 filas que Supabase entrega por petición:
    // se pide por páginas (revenue_report tiene orden total desde la migración 0005)
    const supabase = getSupabaseBrowser();
    void fetchAllPages<RevenueRow>((rFrom, rTo) =>
      supabase.rpc('revenue_report', { p_from: from, p_to: to }).range(rFrom, rTo),
    ).then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) return void toast.error(humanizeError(error));
      setRows(data.map((r) => ({ ...r, total: Number(r.total), sales_count: Number(r.sales_count) })));
    });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const { byDay, byMethod, total, memberships, products, count } = useMemo(() => {
    const dayMap = new Map<string, Record<PaymentMethod, number>>();
    const methodMap: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, wallet: 0 };
    let total = 0;
    let memberships = 0;
    let products = 0;
    let count = 0;
    for (const r of rows) {
      const day = r.day.slice(0, 10);
      const entry = dayMap.get(day) ?? { cash: 0, card: 0, transfer: 0, wallet: 0 };
      entry[r.payment_method] += r.total;
      dayMap.set(day, entry);
      methodMap[r.payment_method] += r.total;
      total += r.total;
      count += r.sales_count;
      if (r.kind === 'membership') memberships += r.total;
      else products += r.total;
    }
    const byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, methods]) => ({ day, methods, total: Object.values(methods).reduce((a, b) => a + b, 0) }));
    return { byDay, byMethod: methodMap, total, memberships, products, count };
  }, [rows]);

  const maxDay = Math.max(1, ...byDay.map((d) => d.total));

  const exportExcel = () =>
    exportToExcel(
      rows.map((r) => ({
        Fecha: r.day.slice(0, 10),
        Tipo: r.kind === 'membership' ? 'Membresía' : 'Producto',
        Método: PAYMENT_LABELS[r.payment_method],
        Operaciones: r.sales_count,
        Total: r.total,
      })),
      `ingresos-${from}-a-${to}`,
      'Ingresos',
    );

  const exportPdf = () =>
    exportToPdf({
      businessName: settings.name,
      title: 'Reporte de ingresos',
      subtitle: `Periodo: ${formatDate(from)} – ${formatDate(to)}`,
      summary: [
        ['Ingresos totales', formatMoney(total, currency)],
        ['Membresías', formatMoney(memberships, currency)],
        ['Barra / productos', formatMoney(products, currency)],
        ['Operaciones', String(count)],
        ...(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => [PAYMENT_LABELS[m], formatMoney(byMethod[m], currency)] as [string, string]),
      ],
      head: ['Fecha', 'Efectivo', 'Tarjeta', 'Transferencia', 'Billetera', 'Total'],
      body: byDay.map((d) => [
        formatDate(d.day),
        formatMoney(d.methods.cash, currency),
        formatMoney(d.methods.card, currency),
        formatMoney(d.methods.transfer, currency),
        formatMoney(d.methods.wallet, currency),
        formatMoney(d.total, currency),
      ]),
      fileName: `ingresos-${from}-a-${to}`,
    });

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field label="Desde" htmlFor="from">
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta" htmlFor="to">
            <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                onClick={() => {
                  setTo(todayISO());
                  setFrom(addDaysISO(todayISO(), -p.days));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {can('finances', 'export') && (
            <div className="flex gap-2 md:ml-auto">
              <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={exportPdf} disabled={rows.length === 0}>
                <FileDown className="h-4 w-4" /> PDF
              </Button>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Ingresos del periodo" value={formatMoney(total, currency)} tone="olive" hint={`${count} operaciones`} />
          <StatTile label="Membresías" value={formatMoney(memberships, currency)} tone="copper" />
          <StatTile label="Barra / productos" value={formatMoney(products, currency)} />
          <StatTile label="Ticket promedio" value={formatMoney(count ? total / count : 0, currency)} />
        </div>
      )}

      <Card>
        <CardHeader
          title="Ingresos por día"
          description="Apilado por método de pago"
          action={
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-xs ${METHOD_COLOR[m]}`} /> {PAYMENT_LABELS[m]}
                </span>
              ))}
            </div>
          }
        />
        {!loading && byDay.length === 0 ? (
          <EmptyState icon={BarChart3} title="Sin ventas en el periodo" description="Ajusta el rango de fechas o registra ventas desde el punto de venta." />
        ) : (
          <div className="overflow-x-auto p-5">
            <div className="flex h-64 min-w-full items-end gap-1.5" style={{ minWidth: byDay.length * 28 }}>
              {byDay.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${formatDate(d.day)} · ${formatMoney(d.total, currency)}`}>
                  <div className="flex flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(d.total / maxDay) * 100}%` }}>
                    {(Object.keys(d.methods) as PaymentMethod[]).map((m) =>
                      d.methods[m] > 0 ? (
                        <div key={m} className={METHOD_COLOR[m]} style={{ height: `${(d.methods[m] / d.total) * 100}%` }} />
                      ) : null,
                    )}
                  </div>
                  <span className="mt-1.5 text-center text-[10px] tabular-nums text-muted">{d.day.slice(8, 10)}</span>
                  <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-canvas group-hover:block">
                    {formatMoney(d.total, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Distribución por método de pago" />
        <ul className="divide-y divide-line">
          {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => {
            const pct = total ? (byMethod[m] / total) * 100 : 0;
            return (
              <li key={m} className="flex items-center gap-4 px-5 py-3">
                <span className="w-32 shrink-0 text-sm">{PAYMENT_LABELS[m]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full ${METHOD_COLOR[m]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatMoney(byMethod[m], currency)}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{pct.toFixed(0)}%</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
