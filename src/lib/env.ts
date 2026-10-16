import { z } from 'zod';

const publicSchema = z.object({
  url: z.string().url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida'),
  anonKey: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY no está configurada'),
});

export function getPublicEnv() {
  const parsed = publicSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno inválidas: ${parsed.error.issues.map((i) => i.message).join('; ')}. Revisa .env.local`,
    );
  }
  return parsed.data;
}
