'use client';

/**
 * Reduce una foto en el navegador antes de subirla a Supabase Storage.
 * Una foto de celular (3-8 MB) queda en ~40-80 KB: menos almacenamiento y mucho menos egress,
 * porque las fotos se descargan cada vez que se abre un perfil o se valida un check-in.
 * Si el navegador no puede procesarla, devuelve el archivo original (nunca bloquea la subida).
 */
export async function compressImage(file: File, maxSide = 512, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Safari no codifica WEBP en canvas (devuelve PNG): en ese caso se usa JPEG
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
  } catch {
    return file;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
