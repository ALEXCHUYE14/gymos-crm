'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/export';
import { humanizeError } from '@/lib/errors';
import { formatDate, sanitizeSearch, STATUS_LABELS } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCan } from '@/stores/session-store';
import type { Member, MembershipStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { createMember, deleteMembers } from './actions';
import { MemberForm } from './member-form';

const PAGE_SIZE = 20;
type Row = Pick<Member, 'id' | 'dni' | 'first_name' | 'last_name' | 'phone' | 'email' | 'status' | 'created_at'>;

export function MembersTable({ trainers }: { trainers: Array<{ id: string; full_name: string }> }) {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);
  const debounced = useDebounce(search, 300);

  useEffect(() => setPage(1), [debounced, status, sort]);

  const buildQuery = useCallback(
    (columns: string, withCount: boolean) => {
      const supabase = getSupabaseBrowser();
      let q = supabase.from('members').select(columns, withCount ? { count: 'exact' } : undefined);
      const term = sanitizeSearch(debounced);
      if (term) q = q.or(`dni.ilike.${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`);
      if (status) q = q.eq('status', status);
      q = sort === 'name' ? q.order('last_name').order('first_name') : q.order('created_at', { ascending: false });
      return q;
    },
    [debounced, status, sort],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    buildQuery('id, dni, first_name, last_name, phone, email, status, created_at', true)
      .range(from, from + PAGE_SIZE - 1)
      .then(({ data, error, count }) => {
        if (cancelled) return;
        if (error) toast.error(humanizeError(error));
        setRows((data ?? []) as unknown as Row[]);
        setTotal(count ?? 0);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildQuery, page, reloadKey]);

  const exportRows = async (onlySelected: boolean) => {
    let q = buildQuery('dni, first_name, last_name, phone, email, status, created_at', false);
    if (onlySelected) q = q.in('id', Array.from(selected));
    const { data, error } = await q.limit(5000);
    if (error) {
      toast.error(humanizeError(error));
      return;
    }
    const list = (data ?? []) as unknown as Row[];
    await exportToExcel(
      list.map((m) => ({
        DNI: m.dni,
        Nombres: m.first_name,
        Apellidos: m.last_name,
        Teléfono: m.phone,
        Correo: m.email,
        Estado: STATUS_LABELS[m.status],
        'Fecha de registro': formatDate(m.created_at),
      })),
      `socios-${new Date().toISOString().slice(0, 10)}`,
      'Socios',
    );
    toast.success(`${list.length} socio(s) exportado(s)`);
  };

  const runDelete = () =>
    startDelete(async () => {
      const res = await deleteMembers(Array.from(selected));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Eliminados');
      setSelected(new Set());
      setConfirmDelete(false);
      setReloadKey((k) => k + 1);
    });

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Socio',
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {m.first_name} {m.last_name}
          </p>
          <p className="font-mono text-xs text-muted">{m.dni}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Teléfono', cell: (m) => m.phone ?? '—', hideOnMobile: true },
    { key: 'email', header: 'Correo', cell: (m) => <span className="truncate">{m.email ?? '—'}</span>, hideOnMobile: true },
    { key: 'status', header: 'Estado', cell: (m) => <StatusBadge status={m.status} /> },
    { key: 'created', header: 'Registro', cell: (m) => formatDate(m.created_at), hideOnMobile: true },
  ];

  const canExport = can('members', 'export');
  const canDelete = can('members', 'delete');

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por DNI, nombre o teléfono"
              className="pl-9"
              aria-label="Buscar socios"
            />
          </div>
          <div className="flex gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as MembershipStatus | '')} aria-label="Filtrar por estado" className="md:w-40">
              <option value="">Todos los estados</option>
              {(['active', 'frozen', 'expired', 'debtor'] as MembershipStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} aria-label="Ordenar" className="md:w-36">
              <option value="recent">Más recientes</option>
              <option value="name">Apellido A-Z</option>
            </Select>
          </div>
          <div className="flex gap-2">
            {canExport && (
              <Button variant="outline" onClick={() => exportRows(false)} disabled={total === 0}>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            )}
            {can('members', 'create') && (
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Nuevo socio
              </Button>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-olive-soft/40 px-4 py-2.5 text-sm">
            <span className="font-medium">{selected.size} seleccionado(s)</span>
            <div className="flex gap-2">
              {canExport && (
                <Button size="sm" variant="outline" onClick={() => exportRows(true)}>
                  <Download className="h-3.5 w-3.5" /> Exportar selección
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpiar
              </Button>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          selectable={canExport || canDelete}
          selected={selected}
          onSelectedChange={setSelected}
          onRowClick={(r) => router.push(`/members/${r.id}`)}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          empty={{
            icon: Users,
            title: debounced || status ? 'Sin resultados' : 'Todavía no hay socios',
            description:
              debounced || status
                ? 'Ningún socio coincide con la búsqueda o el filtro. Prueba con otro DNI o quita el filtro de estado.'
                : 'Registra al primer socio para empezar a vender membresías y controlar su acceso desde recepción.',
            action:
              !debounced && !status && can('members', 'create') ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Registrar socio
                </Button>
              ) : undefined,
          }}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo socio" description="Datos personales y de salud" size="lg">
        <MemberForm
          trainers={trainers}
          submitLabel="Registrar socio"
          onSubmit={createMember}
          onCancel={() => setCreateOpen(false)}
          onDone={(res) => {
            setCreateOpen(false);
            if (res.ok && res.data && typeof res.data === 'object' && 'id' in res.data) {
              router.push(`/members/${String((res.data as { id: string }).id)}`);
            }
          }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={runDelete}
        loading={deleting}
        title={`Eliminar ${selected.size} socio(s)`}
        description="Se eliminarán sus membresías, asistencias y rutinas. Las ventas registradas se conservan en el libro de caja. Esta acción no se puede deshacer."
        confirmLabel="Eliminar definitivamente"
      />
    </>
  );
}
