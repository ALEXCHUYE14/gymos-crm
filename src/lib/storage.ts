import type { SupabaseClient } from '@supabase/supabase-js';

export const BRANDING_BUCKET = 'branding';
export const MEMBER_PHOTOS_BUCKET = 'member-photos';
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function brandingPublicUrl(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function memberPhotoUrl(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(MEMBER_PHOTOS_BUCKET).createSignedUrl(path, 60 * 30);
  if (error) return null;
  return data.signedUrl;
}

/** Fotos de socios: se aceptan originales grandes porque se comprimen antes de subir. */
export const MAX_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
/** Los nombres de archivo son únicos (timestamp): el navegador/CDN puede cachearlos 1 año. */
export const IMMUTABLE_CACHE_SECONDS = '31536000';

export function validateImage(file: File, extraTypes: string[] = [], maxBytes = MAX_IMAGE_BYTES): string | null {
  if (![...ALLOWED_IMAGE_TYPES, ...extraTypes].includes(file.type)) return 'Formato no permitido (usa PNG, JPG o WEBP).';
  if (file.size > maxBytes) return `La imagen supera los ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

export function extensionFor(file: File) {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return map[file.type] ?? 'bin';
}
