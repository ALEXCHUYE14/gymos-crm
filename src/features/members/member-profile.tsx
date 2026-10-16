'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowLeft,
  Camera,
  CircleDollarSign,
  Download,
  Dumbbell,
  HeartPulse,
  History,
  Pause,
  Pencil,
  Phone,
  Play,
  QrCode,
  Ban,
  CreditCard,
  Mail,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { extensionFor, MEMBER_PHOTOS_BUCKET, validateImage } from '@/lib/storage';
import { humanizeError } from '@/lib/errors';
import { cn, formatDate, formatDateTime, formatMoney, PAYMENT_LABELS, STATUS_LABELS } from '@/lib/utils';
import { useCan, useCurrency } from '@/stores/session-store';
import type { Member, MembershipWithPlan, PaymentMethod, Plan, Routine } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatTile } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Avatar, EmptyState } from '@/components/ui/feedback';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Field, Input } from '@/components/ui/form';
import { MemberForm } from './member-form';
import { changeMembershipState, setMemberPhoto, updateMember } from './actions';
import { SellMembershipForm } from '@/features/pos/sell-membership-form';
import { PaymentMethodPicker } from '@/features/pos/payment-method-picker';
import { payMembershipDebt } from '@/features/pos/actions';

export interface TimelineEvent {
  id: string;
  at: string;
  type: 'attendance' | 'payment';
  title: string;
  detail: string;
  amount?: number;
  method?: PaymentMethod;
  tone: 'ok' | 'warn' | 'danger' | 'olive';
}

interface Props {
  member: Member;
  photoUrl: string | null;
  memberships: MembershipWithPlan[];
  plans: Plan[];
  routines: Routine[];
  trainers: Array<{ id: string; full_name: string }>;
  timeline: TimelineEvent[];
  monthAttendance: number;
}

export function MemberProfile({ member, photoUrl, memberships, plans, routines, trainers, timeline, monthAttendance }: Props) {
  const router = useRouter();
  const can = useCan();
  const currency = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [debtTarget, setDebtTarget] = useState<MembershipWithPlan | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MembershipWithPlan | null>(null);
  const [pending, startTransition] = useTransition();
  const fullName = `${member.first_name} ${member.last_name}`;
  const debt = memberships
    .filter((m) => m.status !== 'cancelled')
    .reduce((acc, m) => acc + (Number(m.price) - Number(m.amount_paid)), 0);
  const current = memberships.find((m) => m.status === 'active' || m.status === 'frozen');

  const uploadPhoto = async (file: File) => {
    const invalid = validateImage(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    const path = `${member.id}/${Date.now()}.${extensionFor(file)}`;
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.storage.from(MEMBER_PHOTOS_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(humanizeError(error));
      return;
    }
    const res = await setMemberPhoto(member.id, path);
    if (res.ok && member.photo_path) {
      await supabase.storage.from(MEMBER_PHOTOS_BUCKET).remove([member.photo_path]);
    }
    setUploading(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(res.message ?? 'Foto actualizada');
      router.refresh();
    }
  };

  const runMembershipAction = (membershipId: string, action: 'freeze' | 'unfreeze' | 'cancel') =>
    startTransition(async () => {
      const res = await changeMembershipState({ membership_id: membershipId, action });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? 'Actualizado');
        setCancelTarget(null);
        router.refresh();
      }
    });

  const downloadQr = () => {
    const canvas = document.getElementById('member-qr') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-${member.dni}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <>
      <Link href="/members" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Socios
      </Link>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
          <div className="relative w-fit">
            <Avatar src={photoUrl} name={fullName} size={88} />
            {can('members', 'update') && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 rounded-full border border-line bg-surface p-2 text-muted shadow-sm hover:text-ink disabled:opacity-50"
                  aria-label="Cambiar foto"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPhoto(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{fullName}</h1>
              <StatusBadge status={member.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span className="font-mono">DNI {member.dni}</span>
              {member.phone && (
                <a href={`https://wa.me/${member.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone className="h-3.5 w-3.5" /> {member.phone}
                </a>
              )}
              {member.email && (
                <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Mail className="h-3.5 w-3.5" /> {member.email}
                </a>
              )}
              {member.birth_date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDate(member.birth_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" /> QR de acceso
            </Button>
            {can('members', 'update') && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            {can('pos', 'create') && (
              <Button onClick={() => setSellOpen(true)}>
                <CreditCard className="h-4 w-4" /> Vender membresía
              </Button>
            )}
          </div>
        </div>
        {member.medical_notes && (
          <div className="flex gap-3 border-t border-line bg-copper-soft/50 px-5 py-3 text-sm">
            <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
            <div>
              <p className="font-medium text-copper">Restricciones médicas</p>
              <p className="text-ink/90">{member.medical_notes}</p>
            </div>
          </div>
        )}
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Membresía vigente"
          value={current ? (current.plan?.name ?? '—') : 'Ninguna'}
          hint={current ? `Hasta ${formatDate(current.end_date)}` : 'Vende un plan para habilitar el acceso'}
          tone="olive"
        />
        <StatTile label="Asistencias (30 días)" value={monthAttendance} />
        <StatTile label="Saldo pendiente" value={formatMoney(debt, currency)} tone={debt > 0 ? 'danger' : 'default'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Membresías" description="Historial de planes, pagos y congelamientos" />
            {memberships.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Sin membresías"
                description="Este socio aún no tiene planes. Al venderle uno, su acceso en recepción se habilita automáticamente."
              />
            ) : (
              <ul className="divide-y divide-line">
                {memberships.map((m) => {
                  const pendingAmount = Number(m.price) - Number(m.amount_paid);
                  return (
                    <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{m.plan?.name ?? 'Plan eliminado'}</p>
                          <Badge tone={m.status === 'active' ? 'ok' : m.status === 'frozen' ? 'copper' : 'neutral'}>
                            {STATUS_LABELS[m.status]}
                          </Badge>
                          {pendingAmount > 0 && m.status !== 'cancelled' && (
                            <Badge tone="danger">Debe {formatMoney(pendingAmount, currency)}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatDate(m.start_date)} → {formatDate(m.end_date)} · {formatMoney(m.amount_paid, currency)} de{' '}
                          {formatMoney(m.price, currency)}
                          {m.freeze_days_used > 0 && ` · ${m.freeze_days_used} días congelados`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pendingAmount > 0 && m.status !== 'cancelled' && can('pos', 'create') && (
                          <Button size="sm" variant="outline" onClick={() => setDebtTarget(m)}>
                            <CircleDollarSign className="h-3.5 w-3.5" /> Abonar
                          </Button>
                        )}
                        {m.status === 'active' && can('members', 'update') && (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => runMembershipAction(m.id, 'freeze')}>
                            <Pause className="h-3.5 w-3.5" /> Congelar
                          </Button>
                        )}
                        {m.status === 'frozen' && can('members', 'update') && (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => runMembershipAction(m.id, 'unfreeze')}>
                            <Play className="h-3.5 w-3.5" /> Reactivar
                          </Button>
                        )}
                        {(m.status === 'active' || m.status === 'frozen') && can('members', 'delete') && (
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancelTarget(m)}>
                            <Ban className="h-3.5 w-3.5" /> Anular
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {can('routines', 'read') && (
            <Card>
              <CardHeader
                title="Rutinas asignadas"
                action={
                  can('routines', 'create') ? (
                    <Link href={`/routines?member=${member.id}`} className="text-sm font-medium text-olive hover:underline">
                      Asignar rutina
                    </Link>
                  ) : undefined
                }
              />
              {routines.length === 0 ? (
                <EmptyState icon={Dumbbell} title="Sin rutinas" description="Un entrenador puede asignarle una rutina desde el módulo Rutinas." />
              ) : (
                <ul className="divide-y divide-line">
                  {routines.map((r) => (
                    <li key={r.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{r.title}</p>
                        <Badge tone={r.active ? 'olive' : 'neutral'}>{r.active ? 'Activa' : 'Finalizada'}</Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {r.exercises.length} ejercicios · desde {formatDate(r.start_date)}
                        {r.goal ? ` · ${r.goal}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Línea de tiempo" description="Asistencias y pagos" />
          {timeline.length === 0 ? (
            <EmptyState icon={History} title="Sin actividad" description="Los ingresos y pagos del socio aparecerán aquí en orden cronológico." />
          ) : (
            <ol className="max-h-[640px] overflow-y-auto px-5 py-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative border-l border-line pb-5 pl-5 last:pb-0">
                  <span
                    className={cn(
                      'absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full',
                      { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', olive: 'bg-copper' }[e.tone],
                    )}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    {e.amount !== undefined && <span className="text-sm font-medium tabular-nums">{formatMoney(e.amount, currency)}</span>}
                  </div>
                  <p className="text-xs text-muted">
                    {formatDateTime(e.at)}
                    {e.method ? ` · ${PAYMENT_LABELS[e.method]}` : ''}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar socio" size="lg">
        <MemberForm
          initial={member}
          trainers={trainers}
          submitLabel="Guardar cambios"
          onSubmit={(values) => updateMember(member.id, values)}
          onCancel={() => setEditOpen(false)}
          onDone={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="QR de acceso" description="El socio lo muestra en recepción" size="sm">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeCanvas id="member-qr" value={member.qr_token} size={220} level="M" marginSize={1} />
          </div>
          <p className="text-center text-sm font-medium">{fullName}</p>
          <Button variant="outline" onClick={downloadQr}>
            <Download className="h-4 w-4" /> Descargar PNG
          </Button>
        </div>
      </Modal>

      <Modal open={sellOpen} onClose={() => setSellOpen(false)} title="Vender membresía" description={fullName} size="md">
        <SellMembershipForm
          memberId={member.id}
          plans={plans}
          onCancel={() => setSellOpen(false)}
          onDone={() => {
            setSellOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      <DebtModal
        membership={debtTarget}
        onClose={() => setDebtTarget(null)}
        onDone={() => {
          setDebtTarget(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && runMembershipAction(cancelTarget.id, 'cancel')}
        loading={pending}
        title="Anular membresía"
        description="El socio perderá el acceso de inmediato y la deuda asociada dejará de contarse. El pago ya registrado permanece en caja."
        confirmLabel="Anular"
      />
    </>
  );
}

function DebtModal({
  membership,
  onClose,
  onDone,
}: {
  membership: MembershipWithPlan | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const currency = useCurrency();
  const pendingAmount = membership ? Number(membership.price) - Number(membership.amount_paid) : 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!membership) return;
    setSaving(true);
    const res = await payMembershipDebt({ membership_id: membership.id, amount: amount || pendingAmount, payment_method: method });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data.remaining > 0 ? `Abono registrado. Resta ${formatMoney(res.data.remaining, currency)}` : 'Deuda saldada');
    setAmount('');
    onDone();
  };

  return (
    <Modal
      open={!!membership}
      onClose={onClose}
      title="Registrar abono"
      description={`Saldo pendiente: ${formatMoney(pendingAmount, currency)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Registrar pago
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`Monto (${currency})`} htmlFor="debt-amount" hint="Vacío para saldar el total">
          <Input
            id="debt-amount"
            type="number"
            step="0.01"
            min={0}
            max={pendingAmount}
            inputMode="decimal"
            value={amount}
            placeholder={pendingAmount.toFixed(2)}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <PaymentMethodPicker value={method} onChange={setMethod} />
      </div>
    </Modal>
  );
}
