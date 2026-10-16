'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { EmptyState, Skeleton } from './feedback';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Oculta la columna en pantallas pequeñas */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onRowClick?: (row: T) => void;
  empty?: { icon?: LucideIcon; title: string; description: string; action?: ReactNode };
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  selectable,
  selected,
  onSelectedChange,
  onRowClick,
  empty,
  page,
  pageSize,
  total,
  onPageChange,
}: DataTableProps<T>) {
  const allIds = rows.map(rowKey);
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selected?.has(id));

  const toggleAll = () => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (allSelected) allIds.forEach((id) => next.delete(id));
    else allIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  };

  const toggleOne = (id: string) => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const totalPages = total !== undefined && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const hideCls = (c: Column<T>) => (c.hideOnMobile ? 'hidden md:table-cell' : '');

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={!!allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded-sm accent-[rgb(var(--olive))]"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn('px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted', hideCls(c), c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {selectable && (
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-4" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3', hideCls(c))}>
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const id = rowKey(row);
                  return (
                    <tr
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'border-b border-line transition-colors last:border-0',
                        onRowClick && 'cursor-pointer hover:bg-surface-2/60',
                        selected?.has(id) && 'bg-olive-soft/50',
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label="Seleccionar fila"
                            checked={selected?.has(id) ?? false}
                            onChange={() => toggleOne(id)}
                            className="h-4 w-4 rounded-sm accent-[rgb(var(--olive))]"
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-4 py-3 align-middle text-ink', hideCls(c), c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && empty && (
        <EmptyState icon={empty.icon ?? Inbox} title={empty.title} description={empty.description} action={empty.action} />
      )}

      {onPageChange && page !== undefined && total !== undefined && total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          <span className="tabular-nums">
            {(page - 1) * (pageSize ?? 0) + 1}–{Math.min(page * (pageSize ?? 0), total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Página siguiente"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
