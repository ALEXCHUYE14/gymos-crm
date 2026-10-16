import type { PostgrestError } from '@supabase/supabase-js';

interface ErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
}

/** Traduce errores de Postgres/PostgREST a mensajes comprensibles para el operador. */
export function humanizeError(error: unknown): string {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  const e = error as ErrorLike & Partial<PostgrestError>;
  switch (e.code) {
    case '42501':
      return e.message?.startsWith('No ') || e.message?.startsWith('Solo')
        ? e.message
        : 'No tienes permiso para realizar esta acción.';
    case '23505':
      if (e.message?.includes('dni')) return 'Ya existe un socio con ese DNI.';
      if (e.message?.includes('sku')) return 'Ya existe un producto con ese SKU.';
      if (e.message?.includes('one_open_per_user')) return 'Ya tienes una caja abierta.';
      return 'El registro ya existe.';
    case '23503':
      return 'No se puede completar: el registro está relacionado con otros datos.';
    case '23514':
      return 'Algún valor no cumple las reglas de validación.';
    case 'PGRST116':
      return 'Registro no encontrado.';
    default:
      break;
  }
  if (e.message?.includes('Failed to fetch')) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (e.message?.includes('row-level security')) return 'No tienes permiso para realizar esta acción.';
  return e.message ?? 'Ocurrió un error inesperado.';
}
