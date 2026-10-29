'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, Building2, Clock, ImageUp, QrCode, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { BRANDING_BUCKET, brandingPublicUrl, extensionFor, IMMUTABLE_CACHE_SECONDS, validateImage } from '@/lib/storage';
import { humanizeError } from '@/lib/errors';
import {
  businessRulesSchema,
  businessSettingsSchema,
  notificationSettingsSchema,
  type BusinessRulesValues,
  type BusinessSettingsValues,
  type NotificationSettingsValues,
} from '@/lib/validations';
import { formatDateTime } from '@/lib/utils';
import { useCan, useSession } from '@/stores/session-store';
import type { ActionResult, BusinessSettings } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { saveBusinessInfo, saveBusinessRules, saveNotificationSettings, setBrandingAsset } from './actions';
import defaultLogo from '@/assets/brand/logo-circle.webp';

export interface NotificationLogRow {
  id: string;
  channel: 'whatsapp' | 'email';
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
  member: { first_name: string; last_name: string } | null;
}

export function SettingsPanel({ logs }: { logs: NotificationLogRow[] }) {
  const can = useCan();
  const readOnly = !can('settings', 'update');
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <BusinessInfoCard readOnly={readOnly} />
      <div className="space-y-6">
        <BrandingCard kind="logo" readOnly={readOnly} />
        <BrandingCard kind="payment_qr" readOnly={readOnly} />
      </div>
      <RulesCard readOnly={readOnly} />
      <NotificationsCard readOnly={readOnly} logs={logs} />
    </div>
  );
}

function useApply() {
  const { setSettings } = useSession();
  const router = useRouter();
  return (res: ActionResult<BusinessSettings>, urls?: { logoUrl?: string | null; paymentQrUrl?: string | null }) => {
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setSettings(res.data, urls);
    toast.success(res.message ?? 'Guardado');
    router.refresh();
    return true;
  };
}

function BusinessInfoCard({ readOnly }: { readOnly: boolean }) {
  const { settings } = useSession();
  const apply = useApply();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
    getValues,
  } = useForm<BusinessSettingsValues, unknown, z.output<typeof businessSettingsSchema>>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: {
      name: settings.name,
      tax_id: settings.tax_id ?? '',
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      currency: settings.currency,
      timezone: settings.timezone,
    },
  });

  const submit = handleSubmit(async (values) => {
    const res = await saveBusinessInfo(values);
    if (apply(res)) reset(getValues());
  });

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-olive" /> Datos comerciales</span>} description="Aparecen en reportes y comprobantes" />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del gimnasio" htmlFor="b-name" error={errors.name?.message} className="sm:col-span-2">
              <Input id="b-name" {...register('name')} />
            </Field>
            <Field label="RUC / NIT" htmlFor="b-tax" error={errors.tax_id?.message}>
              <Input id="b-tax" inputMode="numeric" {...register('tax_id')} />
            </Field>
            <Field label="Teléfono" htmlFor="b-phone" error={errors.phone?.message}>
              <Input id="b-phone" type="tel" {...register('phone')} />
            </Field>
            <Field label="Correo" htmlFor="b-email" error={errors.email?.message}>
              <Input id="b-email" type="email" {...register('email')} />
            </Field>
            <Field label="Moneda" htmlFor="b-cur" error={errors.currency?.message}>
              <Select id="b-cur" {...register('currency')}>
                <option value="S/">S/ — Sol peruano</option>
                <option value="$">$ — Dólar</option>
                <option value="€">€ — Euro</option>
              </Select>
            </Field>
            <Field label="Dirección" htmlFor="b-addr" error={errors.address?.message} className="sm:col-span-2">
              <Input id="b-addr" {...register('address')} />
            </Field>
            <Field label="Zona horaria" htmlFor="b-tz" error={errors.timezone?.message} hint="Define el corte de día para vencimientos y reportes">
              <Input id="b-tz" list="tz-list" {...register('timezone')} />
              <datalist id="tz-list">
                {['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'].map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </Field>
          </fieldset>
          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Guardar datos
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function BrandingCard({ kind, readOnly }: { kind: 'logo' | 'payment_qr'; readOnly: boolean }) {
  const { logoUrl, paymentQrUrl } = useSession();
  const apply = useApply();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const current = kind === 'logo' ? logoUrl : paymentQrUrl;
  const urlKey = kind === 'logo' ? 'logoUrl' : 'paymentQrUrl';

  const upload = async (file: File) => {
    const invalid = validateImage(file, kind === 'logo' ? ['image/svg+xml'] : []);
    if (invalid) return void toast.error(invalid);
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const path = `${kind}/${Date.now()}.${extensionFor(file)}`;
    const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: IMMUTABLE_CACHE_SECONDS });
    if (error) {
      setBusy(false);
      return void toast.error(humanizeError(error));
    }
    const res = await setBrandingAsset({ kind, path });
    setBusy(false);
    apply(res, { [urlKey]: brandingPublicUrl(supabase, path) });
  };

  const remove = async () => {
    setBusy(true);
    const res = await setBrandingAsset({ kind, path: null });
    setBusy(false);
    apply(res, { [urlKey]: null });
  };

  const meta =
    kind === 'logo'
      ? { title: 'Identidad gráfica', desc: 'Logotipo oficial (PNG, JPG, WEBP o SVG · máx. 3 MB)', icon: ImageUp }
      : { title: 'Pasarela de pagos · QR local', desc: 'QR de Yape, Plin u otra billetera. Se muestra al cobrar.', icon: QrCode };

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><meta.icon className="h-4 w-4 text-olive" /> {meta.title}</span>} description={meta.desc} />
      <CardBody className="flex items-center gap-5">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt={meta.title} className="h-full w-full bg-white object-contain p-2" />
          ) : kind === 'logo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={defaultLogo.src} alt="Logo predeterminado" className="h-full w-full object-contain p-1" />
          ) : (
            <meta.icon className="h-8 w-8 text-muted" strokeWidth={1.25} />
          )}
        </div>
        {!readOnly && (
          <div className="flex flex-col gap-2">
            {kind === 'logo' && !current && (
              <p className="text-xs text-muted">Usando el logo predeterminado. Sube el tuyo para mostrarlo en el login y el menú.</p>
            )}
            <Button variant="outline" loading={busy} onClick={() => inputRef.current?.click()}>
              <ImageUp className="h-4 w-4" /> {current ? 'Reemplazar' : 'Subir imagen'}
            </Button>
            {current && (
              <Button variant="ghost" className="text-danger" disabled={busy} onClick={remove}>
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={kind === 'logo' ? 'image/png,image/jpeg,image/webp,image/svg+xml' : 'image/png,image/jpeg,image/webp'}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RulesCard({ readOnly }: { readOnly: boolean }) {
  const { settings } = useSession();
  const apply = useApply();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BusinessRulesValues, unknown, z.output<typeof businessRulesSchema>>({
    resolver: zodResolver(businessRulesSchema),
    defaultValues: {
      freeze_max_days: settings.freeze_max_days,
      tolerance_days: settings.tolerance_days,
      expiry_warning_days: settings.expiry_warning_days,
      opening_hours: settings.opening_hours,
    },
  });

  const submit = handleSubmit(async (values) => {
    const res = await saveBusinessRules(values);
    if (apply(res)) reset(values);
  });

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-olive" /> Reglas del negocio</span>} description="Afectan el check-in y el estado automático de membresías" />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-3">
            <Field label="Máx. días congelados" htmlFor="r-freeze" error={errors.freeze_max_days?.message} hint="Por membresía">
              <Input id="r-freeze" type="number" min={0} {...register('freeze_max_days')} />
            </Field>
            <Field label="Días de tolerancia" htmlFor="r-tol" error={errors.tolerance_days?.message} hint="Acceso tras vencer (amarillo)">
              <Input id="r-tol" type="number" min={0} {...register('tolerance_days')} />
            </Field>
            <Field label="Alerta de vencimiento" htmlFor="r-warn" error={errors.expiry_warning_days?.message} hint="Días antes (amarillo)">
              <Input id="r-warn" type="number" min={0} {...register('expiry_warning_days')} />
            </Field>
            <Field label="Lunes a viernes" htmlFor="h-week" error={errors.opening_hours?.weekdays?.message}>
              <Input id="h-week" placeholder="06:00-22:00" {...register('opening_hours.weekdays')} />
            </Field>
            <Field label="Sábado" htmlFor="h-sat" error={errors.opening_hours?.saturday?.message}>
              <Input id="h-sat" placeholder="07:00-18:00" {...register('opening_hours.saturday')} />
            </Field>
            <Field label="Domingo" htmlFor="h-sun" error={errors.opening_hours?.sunday?.message}>
              <Input id="h-sun" placeholder="Cerrado" {...register('opening_hours.sunday')} />
            </Field>
          </fieldset>
          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Guardar reglas
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function NotificationsCard({ readOnly, logs }: { readOnly: boolean; logs: NotificationLogRow[] }) {
  const { settings } = useSession();
  const apply = useApply();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<NotificationSettingsValues, unknown, z.output<typeof notificationSettingsSchema>>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: {
      notifications_enabled: settings.notifications_enabled,
      reminder_days_before: settings.reminder_days_before,
      whatsapp_webhook_url: settings.whatsapp_webhook_url ?? '',
      email_webhook_url: settings.email_webhook_url ?? '',
      reminder_template: settings.reminder_template,
    },
  });

  const submit = handleSubmit(async (values) => {
    const res = await saveNotificationSettings(values);
    if (apply(res)) reset(getValues());
  });

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/reminders', { method: 'POST' });
      const body = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok) toast.error(body.error ?? 'No se pudieron enviar los recordatorios');
      else toast.success(`Recordatorios enviados: ${body.sent ?? 0} · fallidos: ${body.failed ?? 0}`);
      router.refresh();
    } catch {
      toast.error('Error de red al enviar recordatorios');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Bell className="h-4 w-4 text-olive" /> Automatización y notificaciones</span>}
        description="Recordatorios de vencimiento vía webhook (WhatsApp API / Email)"
        action={
          !readOnly && settings.notifications_enabled ? (
            <Button size="sm" variant="outline" loading={sending} onClick={sendNow}>
              <Send className="h-3.5 w-3.5" /> Enviar ahora
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="n-enabled"
                checked={!!watch('notifications_enabled')}
                onChange={(v) => setValue('notifications_enabled', v, { shouldDirty: true })}
                label="Recordatorios automáticos"
                disabled={readOnly}
              />
              <label htmlFor="n-enabled" className="text-sm">
                Enviar recordatorios automáticos diarios
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Días antes" htmlFor="n-days" error={errors.reminder_days_before?.message}>
                <Input id="n-days" type="number" min={0} max={30} {...register('reminder_days_before')} />
              </Field>
              <Field label="Webhook WhatsApp" htmlFor="n-wa" error={errors.whatsapp_webhook_url?.message}>
                <Input id="n-wa" type="url" placeholder="https://…" {...register('whatsapp_webhook_url')} />
              </Field>
            </div>
            <Field label="Webhook Email" htmlFor="n-mail" error={errors.email_webhook_url?.message}>
              <Input id="n-mail" type="url" placeholder="https://…" {...register('email_webhook_url')} />
            </Field>
            <Field
              label="Plantilla del mensaje"
              htmlFor="n-tpl"
              error={errors.reminder_template?.message}
              hint="Variables: {nombre} {plan} {fecha} {dias}"
            >
              <Textarea id="n-tpl" {...register('reminder_template')} />
            </Field>
          </fieldset>
          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Guardar automatización
              </Button>
            </div>
          )}
        </form>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Últimos envíos</p>
          {logs.length === 0 ? (
            <p className="text-sm text-muted">Todavía no se enviaron recordatorios.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {l.member ? `${l.member.first_name} ${l.member.last_name}` : '—'}
                    <span className="ml-2 text-xs text-muted">{formatDateTime(l.created_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge>{l.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</Badge>
                    <Badge tone={l.status === 'sent' ? 'ok' : 'danger'}>{l.status === 'sent' ? 'Enviado' : 'Falló'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
