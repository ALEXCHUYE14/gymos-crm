-- =====================================================================
-- GymOS · Marca visible en la pantalla de login (sin sesión)
-- Seguro de ejecutar más de una vez.
-- =====================================================================

-- business_settings solo es legible por usuarios autenticados (RLS). El login necesita
-- el nombre y el logo antes de iniciar sesión: se exponen SOLO esos dos campos.
-- Ambos son públicos de todas formas (el logo está en el bucket público "branding").
create or replace function public.login_branding()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'logo_path', logo_path)
  from public.business_settings where id = 1;
$$;

revoke execute on function public.login_branding() from public;
grant execute on function public.login_branding() to anon, authenticated, service_role;
