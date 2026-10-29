import type { PostgrestError } from '@supabase/supabase-js';

/** Supabase devuelve como máximo 1000 filas por petición (max_rows), aunque se pida `.limit(5000)`. */
export const SUPABASE_PAGE_SIZE = 1000;

/**
 * Lee todas las filas de una consulta en páginas de 1000.
 * `page(from, to)` debe aplicar `.range(from, to)` a una consulta con ORDEN TOTAL
 * (si el orden tiene empates, las páginas pueden repetir u omitir filas).
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  maxRows = 50_000,
): Promise<{ data: T[]; error: PostgrestError | null; truncated: boolean }> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: all, error, truncated: false };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < to - from + 1) return { data: all, error: null, truncated: false };
  }
  return { data: all, error: null, truncated: true };
}
