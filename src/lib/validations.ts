import { z } from 'zod';
import { APP_MODULES, PERM_ACTIONS } from '@/types/permissions';

// Mensajes de error genéricos de Zod en español (los personalizados de cada esquema tienen prioridad)
z.config(z.locales.es());

/** Esquemas compartidos: los usa React Hook Form en el cliente y las Server Actions en el servidor. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Política de contraseñas del personal: alta, cambio y recuperación. */
const strongPassword = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(72)
  .regex(/[A-Z]/, 'Incluye una mayúscula')
  .regex(/[a-z]/, 'Incluye una minúscula')
  .regex(/[0-9]/, 'Incluye un número');

export const newPasswordSchema = z
  .object({ password: strongPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export const memberSchema = z.object({
  dni: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,15}$/, 'Documento de 6 a 15 caracteres alfanuméricos'),
  first_name: z.string().trim().min(1, 'Requerido').max(80),
  last_name: z.string().trim().min(1, 'Requerido').max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Correo inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{6,20}$/, 'Teléfono inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.replace(/[\s-]/g, '') : null)),
  birth_date: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : null)),
  gender: z.enum(['M', 'F', 'O']).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  medical_notes: optionalText(1000),
  emergency_contact: optionalText(160),
  trainer_id: z.string().uuid().optional().or(z.literal('')).transform((v) => (v ? v : null)),
});
export type MemberFormValues = z.input<typeof memberSchema>;
export type MemberInput = z.output<typeof memberSchema>;

export const planSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  kind: z.enum(['daily', 'monthly', 'quarterly', 'annual', 'class_pack']),
  duration_days: z.coerce.number().int().min(1, 'Mínimo 1 día').max(1095),
  price: z.coerce.number().min(0, 'No puede ser negativo').max(100000),
  class_credits: z
    .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (typeof v === 'number' ? v : null)),
  description: optionalText(300),
  active: z.boolean().default(true),
});
export type PlanFormValues = z.input<typeof planSchema>;

export const productSchema = z.object({
  sku: optionalText(40),
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
  category: z.string().trim().min(1).max(40),
  price: z.coerce.number().min(0).max(100000),
  cost: z.coerce.number().min(0).max(100000),
  stock: z.coerce.number().int().min(0).max(1000000),
  active: z.boolean().default(true),
});
export type ProductFormValues = z.input<typeof productSchema>;

export const paymentMethodSchema = z.enum(['cash', 'card', 'transfer', 'wallet']);

export const sellMembershipSchema = z.object({
  member_id: z.string().uuid('Selecciona un socio'),
  plan_id: z.string().uuid('Selecciona un plan'),
  payment_method: paymentMethodSchema,
  amount_paid: z.coerce.number().min(0, 'No puede ser negativo'),
  start_date: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : null)),
});
export type SellMembershipValues = z.input<typeof sellMembershipSchema>;

export const cartCheckoutSchema = z.object({
  items: z
    .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(999) }))
    .min(1, 'El carrito está vacío')
    .max(100),
  payment_method: paymentMethodSchema,
  member_id: z.string().uuid().nullable(),
});

export const openRegisterSchema = z.object({
  opening_amount: z.coerce.number().min(0, 'No puede ser negativo').max(1000000),
});
export const closeRegisterSchema = z.object({
  declared_amount: z.coerce.number().min(0, 'No puede ser negativo').max(1000000),
  notes: optionalText(500),
});

const hhmmRange = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^Cerrado$/, 'Formato HH:MM-HH:MM o "Cerrado"');

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  tax_id: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{6,20}$/, 'RUC/NIT inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  address: optionalText(200),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .email('Correo inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  currency: z.enum(['S/', '$', '€']),
  timezone: z.string().trim().min(3).max(60),
});
export type BusinessSettingsValues = z.input<typeof businessSettingsSchema>;

export const businessRulesSchema = z.object({
  freeze_max_days: z.coerce.number().int().min(0).max(365),
  tolerance_days: z.coerce.number().int().min(0).max(30),
  expiry_warning_days: z.coerce.number().int().min(0).max(30),
  opening_hours: z.object({ weekdays: hhmmRange, saturday: hhmmRange, sunday: hhmmRange }),
});
export type BusinessRulesValues = z.input<typeof businessRulesSchema>;

const httpsUrl = z
  .string()
  .trim()
  .url('URL inválida')
  .refine((u) => u.startsWith('https://'), 'Debe usar https://')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

export const notificationSettingsSchema = z.object({
  notifications_enabled: z.boolean(),
  reminder_days_before: z.coerce.number().int().min(0).max(30),
  whatsapp_webhook_url: httpsUrl,
  email_webhook_url: httpsUrl,
  reminder_template: z.string().trim().min(10).max(500),
});
export type NotificationSettingsValues = z.input<typeof notificationSettingsSchema>;

export const inviteStaffSchema = z.object({
  full_name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(100),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: strongPassword,
  role_key: z.enum(['branch_admin', 'receptionist', 'trainer', 'auditor', 'super_admin']),
});
export type InviteStaffValues = z.input<typeof inviteStaffSchema>;

export const permissionToggleSchema = z.object({
  module: z.enum(APP_MODULES),
  action: z.enum(PERM_ACTIONS),
});

export const exerciseSchema = z.object({
  name: z.string().trim().min(2, 'Requerido').max(80),
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.string().trim().min(1, 'Requerido').max(20),
  rest_seconds: z.coerce.number().int().min(0).max(600),
  notes: z.string().trim().max(200).optional(),
});

export const routineSchema = z.object({
  member_id: z.string().uuid('Selecciona un socio'),
  title: z.string().trim().min(3, 'Mínimo 3 caracteres').max(100),
  goal: optionalText(200),
  start_date: isoDate,
  end_date: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : null)),
  exercises: z.array(exerciseSchema).min(1, 'Agrega al menos un ejercicio').max(40),
});
export type RoutineFormValues = z.input<typeof routineSchema>;

export const groupClassSchema = z.object({
  name: z.string().trim().min(2).max(80),
  discipline: z.enum(['CrossFit', 'Spinning', 'Yoga', 'Funcional', 'Otro']),
  trainer_id: z.string().uuid().optional().or(z.literal('')).transform((v) => (v ? v : null)),
  starts_at: z.string().min(16, 'Fecha y hora requeridas'),
  duration_min: z.coerce.number().int().min(15).max(240),
  capacity: z.coerce.number().int().min(1).max(500),
  location: optionalText(80),
});
export type GroupClassFormValues = z.input<typeof groupClassSchema>;

export function zodFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[] | undefined>;
}
