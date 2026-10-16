import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getTrainers } from '@/features/members/queries';
import { PageHeader } from '@/components/ui/card';
import { RoutinesManager, type ClassRow, type RoutineRow } from '@/features/routines/routines-manager';

export const metadata: Metadata = { title: 'Rutinas y clases' };

export default async function RoutinesPage() {
  await requirePermission('routines', 'read');
  const supabase = await getSupabaseServer();
  const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  const [routinesRes, classesRes, trainers] = await Promise.all([
    supabase
      .from('routines')
      .select('*, member:members(id, dni, first_name, last_name, status), trainer:profiles(full_name)')
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('group_classes')
      .select('*, trainer:profiles(full_name), bookings:class_bookings(count)')
      .neq('class_bookings.status', 'cancelled')
      .gte('starts_at', since)
      .order('starts_at')
      .limit(60),
    getTrainers(),
  ]);

  return (
    <>
      <PageHeader title="Rutinas y clases" description="Planes de entrenamiento personalizados y control de aforo en clases dirigidas" />
      <Suspense>
        <RoutinesManager
          routines={(routinesRes.data ?? []) as RoutineRow[]}
          classes={(classesRes.data ?? []) as ClassRow[]}
          trainers={trainers}
        />
      </Suspense>
    </>
  );
}
