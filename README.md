# GymOS — CRM y gestión integral para gimnasios

SaaS B2B para gimnasios construido con **Next.js 15 (App Router) + TypeScript estricto + Tailwind CSS + Supabase** (PostgreSQL, Auth, RLS, RPC y Storage).

Módulos: socios (CRM 360°), recepción con check-in por QR/DNI, membresías con estado automático, POS de barra, caja por turno con arqueo, rutinas y clases con control de aforo, reportes financieros (Excel/PDF), personal con RBAC granular, ajustes globales y recordatorios automáticos por webhook.

---

## 1. Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completa las variables
npm run dev                   # http://localhost:3000
```

### Base de datos (una sola vez)

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor** y ejecuta, en orden, los archivos de `supabase/migrations/`:
   `0001_gym_crm_schema.sql`, `0002_fixes.sql`, `0003_class_credits_checkin.sql`, `0004_login_branding.sql` y `0005_performance.sql`
   (o, con la CLI: `supabase link` y `supabase db push`). 0002 a 0005 se pueden re-ejecutar sin riesgo.
3. En **Authentication → Providers → Email**, **desactiva "Allow new users to sign up"**. El personal se crea desde el módulo *Personal y permisos*.
4. Crea el primer usuario en **Authentication → Users → Add user** (con *Auto Confirm*). **El primer usuario del sistema se convierte automáticamente en Super Admin.**
5. Inicia sesión en `/login`.

### Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (todas las consultas pasan por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor.** Alta de personal y envío de recordatorios |
| `CRON_SECRET` | Secreto (≥16 caracteres) del endpoint `/api/reminders` |

---

## 2. Tareas programadas

**Vencimiento diario de membresías** (en SQL Editor, requiere la extensión `pg_cron`, habilitable en *Database → Extensions*):

```sql
select cron.schedule('gym-expire-memberships', '5 5 * * *', $$ select public.expire_memberships(); $$);
```

Si despliegas en Vercel no es imprescindible: el cron diario de `/api/reminders` también ejecuta `expire_memberships()` antes de enviar recordatorios (aunque las notificaciones estén desactivadas).

**Recordatorios de vencimiento**: `vercel.json` programa `GET /api/reminders` a diario (Vercel envía `Authorization: Bearer $CRON_SECRET`). Fuera de Vercel, usa cualquier cron:

```bash
curl -X POST https://tu-dominio/api/reminders -H "Authorization: Bearer $CRON_SECRET"
```

El endpoint envía a cada webhook (WhatsApp / Email) un JSON:

```json
{ "business": "…", "member": "…", "plan": "…", "end_date": "2026-11-11", "days_left": 3,
  "message": "Hola Ana, tu membresía…", "channel": "whatsapp", "to": "+51987654321" }
```

Conéctalo a tu proveedor (WhatsApp Cloud API, Twilio, n8n, Make, Resend…). No reenvía al mismo socio dentro de 20 horas y todo queda en `notification_log`.

---

## 3. Seguridad

- **RLS en todas las tablas.** Las políticas usan `has_permission(módulo, acción)` (`security definer`, evita recursión).
- **Operaciones críticas solo por RPC atómicas** con bloqueo pesimista `FOR UPDATE`: `check_in`, `open/close_cash_register`, `register_sale` (descuenta stock), `sell_membership`, `pay_membership_debt`, `freeze/unfreeze_membership`, `book_class` (aforo).
- **Libro de ventas inmutable:** `sales`, `sale_items`, `memberships` y `attendance` no tienen políticas de UPDATE/DELETE para usuarios.
- **Anti-escalamiento de privilegios:** el trigger `guard_profile_update` impide cambiar tu propio rol/estado y que no-Super Admin toquen Super Admin. `set_role_permission` / `set_user_override` impiden otorgar permisos que el operador no posee.
- **Roles vía `app_metadata`** (solo escribible con service_role); un registro público sin rol queda inactivo.
- **Validación doble:** los mismos esquemas Zod (`src/lib/validations.ts`) en React Hook Form y en cada Server Action.
- **Middleware** valida el JWT con `auth.getUser()`; cada página verifica su permiso en servidor (`requirePermission`) y la UI oculta lo no autorizado (`useCan`, `<Can>`).
- Fotos de socios en bucket **privado** con URLs firmadas de 30 min; logos/QR en bucket público de solo lectura.
- Cabeceras de seguridad (HSTS, X-Frame-Options, nosniff, Referrer-Policy).

---

## 4. Roles predefinidos

| Rol | Alcance |
|---|---|
| Super Admin | Acceso total (no editable) |
| Administrador de Sucursal | Operación completa, personal (sin Super Admin), finanzas lectura/exportación |
| Recepcionista | Check-in, registro/edición de socios, POS y caja propia |
| Entrenador | Rutinas y clases, alumnos asignados |
| Contador / Auditor | Solo lectura de finanzas, reportes y arqueos |

La matriz se edita en **Personal y permisos → Matriz por rol** (módulo × create/read/update/delete/export). Las **excepciones por usuario** conceden o niegan acciones puntuales sin cambiar el rol.

---

## 5. Estructura

```
supabase/migrations/0001_gym_crm_schema.sql   Esquema, RLS, RPC, triggers, seeds y storage
src/
  app/                       Rutas (App Router)
    (app)/                   Área autenticada: dashboard, checkin, members, pos, cash,
                             products, plans, routines, reports, staff, settings
    api/reminders/route.ts   Recordatorios automáticos (cron)
    login/                   Acceso
  components/ui/             Atómicos: button, form, card, badge, modal, data-table, tabs, feedback
  components/layout/         App shell (sidebar colapsable + bottom nav), <Can>
  features/                  Lógica por dominio (componentes + server actions)
    members/ checkin/ pos/ cash/ routines/ reports/ staff/ settings/ auth/
  lib/supabase/              Clientes browser / server / admin / middleware
  lib/                       auth (contexto y guardias), validations (Zod), export (xlsx/pdf), utils
  stores/                    Contexto de sesión (permisos), Zustand: carrito POS y preferencias UI
  types/                     Tipos de dominio y de permisos
```

Para tipos autogenerados de Supabase: `npm run db:types` (requiere la CLI enlazada).

---

## 6. Despliegue

Vercel: importa el repositorio, define las 4 variables de entorno y despliega. El cron de `vercel.json` se activa automáticamente.
