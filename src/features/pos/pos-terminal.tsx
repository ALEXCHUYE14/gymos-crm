'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Minus, PackageSearch, Plus, Search, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatMoney } from '@/lib/utils';
import { useCartStore, cartTotal } from '@/stores/cart-store';
import { useCurrency } from '@/stores/session-store';
import type { PaymentMethod, Plan, Product } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';
import { PaymentMethodPicker } from './payment-method-picker';
import { MemberPicker, type PickedMember } from './member-picker';
import { SellMembershipForm } from './sell-membership-form';
import { checkoutCart } from './actions';

type Tab = 'products' | 'membership';

export function PosTerminal({ products, plans, hasOpenRegister }: { products: Product[]; plans: Plan[]; hasOpenRegister: boolean }) {
  const router = useRouter();
  const currency = useCurrency();
  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [member, setMember] = useState<PickedMember | null>(null);
  const [membershipMember, setMembershipMember] = useState<PickedMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { lines, add, setQuantity, remove, clear } = useCartStore();
  const total = cartTotal(lines);

  const categories = useMemo(() => ['Todas', ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);
  const filtered = products.filter(
    (p) =>
      (category === 'Todas' || p.category === category) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase() === search.toLowerCase()),
  );

  if (!hasOpenRegister) {
    return (
      <Card>
        <EmptyState
          icon={Wallet}
          title="No tienes una caja abierta"
          description="Para registrar ventas y cobros debes abrir tu caja del turno con el monto inicial en efectivo."
          action={
            <Link href="/cash" className="inline-flex h-10 items-center gap-2 rounded-lg bg-olive px-4 text-sm font-medium text-olive-fg">
              <Wallet className="h-4 w-4" /> Abrir caja
            </Link>
          }
        />
      </Card>
    );
  }

  const checkout = async () => {
    setSubmitting(true);
    const res = await checkoutCart({
      items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      payment_method: method,
      member_id: member?.id ?? null,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Venta registrada · ${formatMoney(res.data.total, currency)}`);
    clear();
    setMember(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Tabs
        items={[
          { key: 'products', label: 'Barra y productos', icon: ShoppingBag },
          { key: 'membership', label: 'Cobrar membresía', icon: CreditCard },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'products' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card>
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o SKU" className="pl-9" aria-label="Buscar producto" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium',
                      category === c ? 'border-olive bg-olive-soft text-olive' : 'border-line text-muted hover:bg-surface-2',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title={products.length === 0 ? 'Sin productos activos' : 'Sin coincidencias'}
                description={products.length === 0 ? 'Registra productos de barra en el módulo Productos para venderlos aquí.' : 'Prueba con otro nombre o categoría.'}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const inCart = lines.find((l) => l.product.id === p.id)?.quantity ?? 0;
                  const out = p.stock - inCart <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => add({ id: p.id, name: p.name, price: Number(p.price), stock: p.stock })}
                      className="relative flex min-h-[104px] flex-col justify-between rounded-xl border border-line bg-canvas p-3 text-left transition active:scale-[0.98] enabled:hover:border-olive disabled:opacity-40"
                    >
                      {inCart > 0 && (
                        <span className="absolute right-2 top-2 rounded-full bg-olive px-2 text-xs font-semibold text-olive-fg">{inCart}</span>
                      )}
                      <span className="line-clamp-2 pr-6 text-sm font-medium">{p.name}</span>
                      <span className="mt-2 flex items-end justify-between">
                        <span className="font-display font-semibold tabular-nums">{formatMoney(p.price, currency)}</span>
                        <span className={cn('text-xs', p.stock <= 5 ? 'text-danger' : 'text-muted')}>{p.stock} u.</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader
              title="Carrito"
              action={
                lines.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={clear}>
                    Vaciar
                  </Button>
                ) : undefined
              }
            />
            <CardBody className="space-y-4">
              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Toca un producto para agregarlo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {lines.map((l) => (
                    <li key={l.product.id} className="flex items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.product.name}</p>
                        <p className="text-xs tabular-nums text-muted">{formatMoney(l.product.price * l.quantity, currency)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity(l.product.id, l.quantity - 1)} aria-label="Restar">
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-7 text-center text-sm tabular-nums">{l.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          disabled={l.quantity >= l.product.stock}
                          onClick={() => setQuantity(l.product.id, l.quantity + 1)}
                          aria-label="Sumar"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={() => remove(l.product.id)} aria-label="Quitar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Socio (opcional)</p>
                <MemberPicker value={member} onChange={setMember} />
              </div>
              <PaymentMethodPicker value={method} onChange={setMethod} />
              <div className="flex items-center justify-between border-t border-line pt-4">
                <span className="text-sm text-muted">Total</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{formatMoney(total, currency)}</span>
              </div>
              <Button size="lg" className="w-full" disabled={lines.length === 0} loading={submitting} onClick={checkout}>
                Registrar venta
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader title="Cobro de membresía" description="Selecciona al socio, el plan y el método de pago" />
          <CardBody className="space-y-5">
            <MemberPicker value={membershipMember} onChange={setMembershipMember} />
            {membershipMember ? (
              <SellMembershipForm
                key={membershipMember.id}
                memberId={membershipMember.id}
                plans={plans}
                onDone={() => {
                  setMembershipMember(null);
                  router.refresh();
                }}
              />
            ) : (
              <p className="text-sm text-muted">Busca al socio por DNI o nombre para continuar.</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
