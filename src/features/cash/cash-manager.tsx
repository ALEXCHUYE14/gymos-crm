'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileDown, Lock, Unlock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { exportToPdf } from '@/lib/export';
import { humanizeError } from '@/lib/errors';
import { closeRegisterSchema, openRegisterSchema } from '@/lib/validations';
import { formatDateTime, formatMoney, PAYMENT_LABELS } from '@/lib/utils';
import { useCan, useSession } from '@/stores/session-store';
import type { CashRegister, CashSummary, PaymentMethod, Sale, SaleItem } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatTile } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Textarea } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { closeRegister, openRegister } from '@/features/pos/actions';

export interface RegisterRow extends CashRegister {
  cashier: { full_name: string } | null;
}

type OpenValues = z.input<typeof openRegisterSchema>;
type CloseValues = z.input<typeof closeRegisterSchema>;

export function CashManager({
  openRegister: current,
  summary,
  history,
}: {
  openRegister: CashRegister | null;
  summary: CashSummary | null;
  history: RegisterRow[];
}) {
  const router = useRouter();
  const can = useCan();
  const { settings, profile } = useSession();
  const currency = settings.currency;
  const [closeOpen, setCloseOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const openForm = useForm<OpenValues, unknown, z.output<typeof openRegisterSchema>>({
    resolver: zodResolver(openRegisterSchema),
    defaultValues: { opening_amount: 0 },
  });
  const closeForm = useForm<CloseValues, unknown, z.output<typeof closeRegisterSchema>>({
    resolver: zodResolver(closeRegisterSchema),
    defaultValues: { declared_amount: 0, notes: '' },
  });

  const declared = Number(closeForm.watch('declared_amount') ?? 0);
  const expected = summary?.expected_cash ?? 0;

  const doOpen = openForm.handleSubmit(async (values) => {
    const res = await openRegister(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? 'Caja abierta');
    router.refresh();
  });

  const doClose = closeForm.handleSubmit(async (values) => {
    if (!current) return;
    const res = await closeRegister(current.id, values);
    if (!res.ok) return void toast.error(res.error);
    const diff = res.data.difference ?? 0;
    toast.success(diff === 0 ? 'Caja cuadrada y cerrada' : `Caja cerrada con diferencia de ${formatMoney(diff, currency)}`);
    setCloseOpen(false);
    closeForm.reset();
    router.refresh();
  });

  const exportRegister = async (reg: RegisterRow) => {
    setExporting(reg.id);
    const supabase = getSupabaseBrowser();
    const [summaryRes, salesRes] = await Promise.all([
      supabase.rpc('cash_register_summary', { p_register_id: reg.id }),
      supabase
        .from('sales')
        .select('*, items:sale_items(*)')
        .eq('cash_register_id', reg.id)
        .order('created_at'),
    ]);
    setExporting(null);
    if (summaryRes.error || salesRes.error) {
      toast.error(humanizeError(summaryRes.error ?? salesRes.error));
      return;
    }
    const s = summaryRes.data as CashSummary;
    const sales = (salesRes.data ?? []) as Array<Sale & { items: SaleItem[] }>;
    await exportToPdf({
      businessName: settings.name,
      title: 'Arqueo de caja',
      subtitle: `Cajero: ${reg.cashier?.full_name ?? '—'} · Apertura: ${formatDateTime(reg.opened_at)} · Cierre: ${formatDateTime(reg.closed_at)}`,
      summary: [
        ['Monto de apertura', formatMoney(s.opening_amount, currency)],
        ...(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map(
          (m) => [PAYMENT_LABELS[m], formatMoney(s.by_method[m] ?? 0, currency)] as [string, string],
        ),
        ['Total vendido', formatMoney(s.sales_total, currency)],
        ['Efectivo esperado', formatMoney(s.expected_cash, currency)],
        ['Efectivo declarado', s.declared_amount === null ? '—' : formatMoney(s.declared_amount, currency)],
        ['Diferencia', s.difference === null ? '—' : formatMoney(s.difference, currency)],
      ],
      head: ['Hora', 'Detalle', 'Método', 'Total'],
      body: sales.map((sale) => [
        formatDateTime(sale.created_at),
        sale.items.map((i) => `${i.quantity}× ${i.description}`).join(', '),
        PAYMENT_LABELS[sale.payment_method],
        formatMoney(sale.total, currency),
      ]),
      fileName: `arqueo-${reg.opened_at.slice(0, 10)}-${reg.id.slice(0, 6)}`,
    });
  };

  const columns: Column<RegisterRow>[] = [
    { key: 'cashier', header: 'Cajero', cell: (r) => r.cashier?.full_name ?? '—' },
    { key: 'opened', header: 'Apertura', cell: (r) => formatDateTime(r.opened_at) },
    { key: 'closed', header: 'Cierre', cell: (r) => (r.closed_at ? formatDateTime(r.closed_at) : '—'), hideOnMobile: true },
    { key: 'expected', header: 'Esperado', cell: (r) => (r.expected_amount === null ? '—' : formatMoney(r.expected_amount, currency)), hideOnMobile: true },
    {
      key: 'diff',
      header: 'Diferencia',
      cell: (r) =>
        r.difference === null ? (
          <Badge tone="olive">Abierta</Badge>
        ) : (
          <Badge tone={Number(r.difference) === 0 ? 'ok' : 'danger'}>{formatMoney(r.difference, currency)}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) =>
        r.opened_by === profile.id || can('finances', 'export') ? (
          <Button size="sm" variant="ghost" loading={exporting === r.id} onClick={() => exportRegister(r)} aria-label="Descargar arqueo PDF">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {can('pos', 'create') &&
        (current && summary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Apertura" value={formatMoney(summary.opening_amount, currency)} hint={formatDateTime(summary.opened_at)} />
              <StatTile label="Ventas del turno" value={formatMoney(summary.sales_total, currency)} hint={`${summary.sales_count} operaciones`} tone="copper" />
              <StatTile label="Efectivo esperado" value={formatMoney(summary.expected_cash, currency)} tone="olive" />
              <StatTile
                label="Digital"
                value={formatMoney((summary.by_method.card ?? 0) + (summary.by_method.transfer ?? 0) + (summary.by_method.wallet ?? 0), currency)}
                hint="Tarjeta + transferencia + billeteras"
              />
            </div>
            <Card>
              <CardHeader
                title="Tu caja está abierta"
                description="Al cerrar, cuenta el efectivo físico y declara el monto exacto."
                action={
                  <Button variant="danger" onClick={() => setCloseOpen(true)}>
                    <Lock className="h-4 w-4" /> Cerrar caja
                  </Button>
                }
              />
              <CardBody className="grid gap-2 sm:grid-cols-4">
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                  <div key={m} className="rounded-xl bg-surface-2 px-4 py-3">
                    <p className="text-xs text-muted">{PAYMENT_LABELS[m]}</p>
                    <p className="font-display text-lg font-semibold tabular-nums">{formatMoney(summary.by_method[m] ?? 0, currency)}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          </>
        ) : (
          <Card className="max-w-xl">
            <CardHeader title="Abrir caja" description="Registra el efectivo con el que inicias el turno" />
            <CardBody>
              <form onSubmit={doOpen} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
                <Field label={`Monto inicial (${currency})`} htmlFor="opening_amount" error={openForm.formState.errors.opening_amount?.message} className="flex-1">
                  <Input id="opening_amount" type="number" step="0.01" min={0} inputMode="decimal" {...openForm.register('opening_amount')} />
                </Field>
                <Button type="submit" loading={openForm.formState.isSubmitting}>
                  <Unlock className="h-4 w-4" /> Abrir caja
                </Button>
              </form>
            </CardBody>
          </Card>
        ))}

      <Card>
        <CardHeader title="Historial de cajas" description={can('finances', 'read') ? 'Todos los cajeros' : 'Tus turnos'} />
        <DataTable
          columns={columns}
          rows={history}
          rowKey={(r) => r.id}
          empty={{ icon: Wallet, title: 'Sin turnos registrados', description: 'Cada apertura y cierre de caja quedará registrado aquí con su arqueo.' }}
        />
      </Card>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Cerrar caja"
        description={`Efectivo esperado: ${formatMoney(expected, currency)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={doClose} loading={closeForm.formState.isSubmitting}>
              Confirmar cierre
            </Button>
          </>
        }
      >
        <form onSubmit={doClose} className="space-y-4" noValidate>
          <Field label={`Efectivo contado (${currency})`} htmlFor="declared_amount" error={closeForm.formState.errors.declared_amount?.message}>
            <Input id="declared_amount" type="number" step="0.01" min={0} inputMode="decimal" {...closeForm.register('declared_amount')} />
          </Field>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Diferencia</span>
              <span className={declared - expected === 0 ? 'font-semibold text-ok' : 'font-semibold text-danger'}>
                {formatMoney(declared - expected, currency)}
              </span>
            </div>
          </div>
          <Field label="Observaciones" htmlFor="notes" error={closeForm.formState.errors.notes?.message}>
            <Textarea id="notes" placeholder="Justifica cualquier diferencia" {...closeForm.register('notes')} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
