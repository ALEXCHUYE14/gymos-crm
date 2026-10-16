'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Boxes, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { exportToExcel } from '@/lib/export';
import { productSchema, type ProductFormValues } from '@/lib/validations';
import { formatMoney } from '@/lib/utils';
import { useCan, useCurrency } from '@/stores/session-store';
import type { Product } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Switch } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { deleteProduct, saveProduct } from './actions';

export function ProductsManager({ products }: { products: Product[] }) {
  const router = useRouter();
  const can = useCan();
  const currency = useCurrency();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      cell: (p) => (
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="text-xs text-muted">
            {p.category}
            {p.sku ? ` · ${p.sku}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'price', header: 'Precio', cell: (p) => formatMoney(p.price, currency) },
    { key: 'cost', header: 'Costo', cell: (p) => formatMoney(p.cost, currency), hideOnMobile: true },
    {
      key: 'stock',
      header: 'Stock',
      cell: (p) => <Badge tone={p.stock === 0 ? 'danger' : p.stock <= 5 ? 'warn' : 'neutral'}>{p.stock} u.</Badge>,
    },
    { key: 'active', header: 'Estado', cell: (p) => <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'Activo' : 'Inactivo'}</Badge>, hideOnMobile: true },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          {can('pos', 'update') && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can('pos', 'delete') && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={() => setToDelete(p)} aria-label={`Eliminar ${p.name}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Card>
        <div className="flex flex-wrap justify-end gap-2 border-b border-line p-4">
          {can('pos', 'export') && (
            <Button
              variant="outline"
              disabled={products.length === 0}
              onClick={() =>
                exportToExcel(
                  products.map((p) => ({ SKU: p.sku, Producto: p.name, Categoría: p.category, Precio: Number(p.price), Costo: Number(p.cost), Stock: p.stock })),
                  'inventario',
                  'Inventario',
                )
              }
            >
              <Download className="h-4 w-4" /> Exportar
            </Button>
          )}
          {can('pos', 'update') && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={products}
          rowKey={(p) => p.id}
          empty={{
            icon: Boxes,
            title: 'Inventario vacío',
            description: 'Agrega bebidas, suplementos o accesorios para venderlos desde el punto de venta con control de stock.',
          }}
        />
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}>
        {editing !== null && (
          <ProductForm
            product={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        loading={deleting}
        title="Eliminar producto"
        description={`¿Eliminar "${toDelete?.name}"? Si tiene ventas registradas se desactivará para conservar el historial.`}
        onConfirm={async () => {
          if (!toDelete) return;
          setDeleting(true);
          const res = await deleteProduct(toDelete.id);
          setDeleting(false);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? 'Eliminado');
          setToDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

function ProductForm({ product, onCancel, onSaved }: { product: Product | null; onCancel: () => void; onSaved: () => void }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      category: product?.category ?? 'Bebidas',
      price: product?.price ?? 0,
      cost: product?.cost ?? 0,
      stock: product?.stock ?? 0,
      active: product?.active ?? true,
    },
  });

  const submit = handleSubmit(async (values) => {
    const res = await saveProduct(product?.id ?? null, values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? 'Guardado');
    onSaved();
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="p-name" error={errors.name?.message} className="sm:col-span-2">
          <Input id="p-name" {...register('name')} />
        </Field>
        <Field label="Categoría" htmlFor="p-cat" error={errors.category?.message}>
          <Input id="p-cat" list="product-categories" {...register('category')} />
          <datalist id="product-categories">
            <option value="Bebidas" />
            <option value="Suplementos" />
            <option value="Snacks" />
            <option value="Accesorios" />
          </datalist>
        </Field>
        <Field label="SKU / Código" htmlFor="p-sku" error={errors.sku?.message}>
          <Input id="p-sku" {...register('sku')} />
        </Field>
        <Field label="Precio de venta" htmlFor="p-price" error={errors.price?.message}>
          <Input id="p-price" type="number" step="0.01" min={0} inputMode="decimal" {...register('price')} />
        </Field>
        <Field label="Costo" htmlFor="p-cost" error={errors.cost?.message}>
          <Input id="p-cost" type="number" step="0.01" min={0} inputMode="decimal" {...register('cost')} />
        </Field>
        <Field label="Stock" htmlFor="p-stock" error={errors.stock?.message}>
          <Input id="p-stock" type="number" step="1" min={0} inputMode="numeric" {...register('stock')} />
        </Field>
        <div className="flex items-end gap-3 pb-2">
          <Switch checked={!!watch('active')} onChange={(v) => setValue('active', v)} label="Producto activo" id="p-active" />
          <label htmlFor="p-active" className="text-sm">
            Disponible para la venta
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
