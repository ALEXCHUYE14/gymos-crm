'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { sanitizeSearch } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import type { Member } from '@/types/database';
import { Input } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';

export type PickedMember = Pick<Member, 'id' | 'dni' | 'first_name' | 'last_name' | 'status'>;

export function MemberPicker({
  value,
  onChange,
  placeholder = 'Buscar socio por DNI o nombre',
}: {
  value: PickedMember | null;
  onChange: (m: PickedMember | null) => void;
  placeholder?: string;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PickedMember[]>([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(term, 250);

  useEffect(() => {
    const q = sanitizeSearch(debounced);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    getSupabaseBrowser()
      .from('members')
      .select('id, dni, first_name, last_name, status')
      .or(`dni.ilike.${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .order('last_name')
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) {
          setResults((data ?? []) as PickedMember[]);
          setOpen(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-olive/40 bg-olive-soft/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {value.first_name} {value.last_name}
          </p>
          <p className="font-mono text-xs text-muted">{value.dni}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={value.status} />
          <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-muted hover:text-ink" aria-label="Quitar socio">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Sin coincidencias</li>
          ) : (
            results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(m);
                    setTerm('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {m.first_name} {m.last_name}
                    </span>
                    <span className="font-mono text-xs text-muted">{m.dni}</span>
                  </span>
                  <StatusBadge status={m.status} />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
