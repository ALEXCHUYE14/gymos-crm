import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasPermission, requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { memberPhotoUrl } from '@/lib/storage';
import { getTrainers } from '@/features/members/queries';
import { MemberProfile, type TimelineEvent } from '@/features/members/member-profile';
import type { Attendance, Member, MembershipWithPlan, Plan, Routine, Sale } from '@/types/database';

export const metadata: Metadata = { title: 'Perfil del socio' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const ctx = await requirePermission('members', 'read');
  const supabase = await getSupabaseServer();

  const [memberRes, membershipsRes, attendanceRes, salesRes, plansRes, routinesRes, trainers] = await Promise.all([
    supabase.from('members').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('memberships')
      .select('*, plan:plans(id, name, kind)')
      .eq('member_id', id)
      .order('start_date', { ascending: false }),
    supabase.from('attendance').select('*').eq('member_id', id).order('checked_in_at', { ascending: false }).limit(60),
    supabase.from('sales').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(60),
    supabase.from('plans').select('*').order('price'),
    hasPermission(ctx, 'routines', 'read')
      ? supabase.from('routines').select('*').eq('member_id', id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Routine[] }),
    getTrainers(),
  ]);

  if (!memberRes.data) notFound();
  const member = memberRes.data as Member;
  const photoUrl = await memberPhotoUrl(supabase, member.photo_path);
  const attendance = (attendanceRes.data ?? []) as Attendance[];
  const sales = (salesRes.data ?? []) as Sale[];

  const timeline: TimelineEvent[] = [
    ...attendance.map<TimelineEvent>((a) => ({
      id: `a-${a.id}`,
      at: a.checked_in_at,
      type: 'attendance',
      title: a.result === 'denied' ? 'Acceso denegado' : 'Ingreso al gimnasio',
      detail: a.reason ?? '',
      tone: a.result === 'granted' ? 'ok' : a.result === 'warning' ? 'warn' : 'danger',
    })),
    ...sales.map<TimelineEvent>((s) => ({
      id: `s-${s.id}`,
      at: s.created_at,
      type: 'payment',
      title: s.kind === 'membership' ? 'Pago de membresía' : 'Compra en barra',
      detail: '',
      amount: Number(s.total),
      method: s.payment_method,
      tone: 'olive',
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <MemberProfile
      member={member}
      photoUrl={photoUrl}
      memberships={(membershipsRes.data ?? []) as MembershipWithPlan[]}
      plans={(plansRes.data ?? []) as Plan[]}
      routines={(routinesRes.data ?? []) as Routine[]}
      trainers={trainers}
      timeline={timeline}
      monthAttendance={attendance.filter((a) => a.result !== 'denied' && Date.now() - new Date(a.checked_in_at).getTime() < 30 * 864e5).length}
    />
  );
}
