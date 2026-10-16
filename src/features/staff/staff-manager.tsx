'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Grid3X3, KeyRound, Minus, ShieldCheck, UserCog, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { inviteStaffSchema, type InviteStaffValues } from '@/lib/validations';
import { cn, formatDate } from '@/lib/utils';
import { useCan } from '@/stores/session-store';
import type { Permission, ProfileWithRole, Role } from '@/types/database';
import { ACTION_LABELS, APP_MODULES, MODULE_LABELS, PERM_ACTIONS, type AppModule, type PermAction, type RoleKey } from '@/types/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { inviteStaff, setUserOverride, toggleRolePermission, updateStaff } from './actions';

type Tab = 'people' | 'roles' | 'overrides';

interface Props {
  currentUserId: string;
  currentRoleKey: RoleKey | null;
  staff: ProfileWithRole[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: Array<{ role_id: string; permission_id: string }>;
  overrides: Array<{ user_id: string; permission_id: string; granted: boolean }>;
}

export function StaffManager({ currentUserId, currentRoleKey, staff, roles, permissions, rolePermissions, overrides }: Props) {
  const router = useRouter();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('people');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(roles.find((r) => r.key !== 'super_admin')?.id ?? '');
  const [selectedUser, setSelectedUser] = useState<string>(
    staff.find((s) => s.id !== currentUserId && s.role?.key !== 'super_admin')?.id ?? '',
  );
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const isSuper = currentRoleKey === 'super_admin';
  const canEdit = can('staff', 'update');

  const permId = useMemo(() => {
    const map = new Map<string, string>();
    permissions.forEach((p) => map.set(`${p.module}.${p.action}`, p.id));
    return map;
  }, [permissions]);
  const roleGrants = useMemo(() => new Set(rolePermissions.map((rp) => `${rp.role_id}:${rp.permission_id}`)), [rolePermissions]);
  const overrideMap = useMemo(() => new Map(overrides.map((o) => [`${o.user_id}:${o.permission_id}`, o.granted])), [overrides]);

  const roleById = (id: string | null) => roles.find((r) => r.id === id);
  const editableRoles = roles.filter((r) => isSuper || (r.key !== 'super_admin' && r.key !== 'branch_admin'));

  const changeRole = async (user: ProfileWithRole, roleId: string) => {
    const res = await updateStaff(user.id, { role_id: roleId });
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? 'Actualizado');
    router.refresh();
  };

  const toggleActive = async (user: ProfileWithRole, active: boolean) => {
    const res = await updateStaff(user.id, { active });
    if (!res.ok) return void toast.error(res.error);
    toast.success(active ? 'Usuario activado' : 'Usuario desactivado');
    router.refresh();
  };

  const toggleRoleCell = async (module: AppModule, action: PermAction, granted: boolean) => {
    const key = `role:${module}.${action}`;
    setPendingCell(key);
    const res = await toggleRolePermission(selectedRole, { module, action }, granted);
    setPendingCell(null);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };

  const cycleOverride = async (module: AppModule, action: PermAction, current: boolean | undefined) => {
    // Ciclo: heredar → conceder → denegar → heredar
    const next = current === undefined ? true : current === true ? false : null;
    const key = `user:${module}.${action}`;
    setPendingCell(key);
    const res = await setUserOverride(selectedUser, { module, action }, next);
    setPendingCell(null);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };

  const columns: Column<ProfileWithRole>[] = [
    {
      key: 'name',
      header: 'Usuario',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.full_name || u.email} size={34} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {u.full_name || '—'} {u.id === currentUserId && <span className="text-xs text-muted">(tú)</span>}
            </p>
            <p className="truncate text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      cell: (u) => {
        const locked = !canEdit || u.id === currentUserId || (u.role?.key === 'super_admin' && !isSuper);
        if (locked) return <Badge tone={u.role?.key === 'super_admin' ? 'copper' : 'olive'}>{u.role?.name ?? 'Sin rol'}</Badge>;
        return (
          <Select value={u.role_id ?? ''} onChange={(e) => changeRole(u, e.target.value)} className="h-9 max-w-[220px]" aria-label={`Rol de ${u.full_name}`}>
            {!u.role_id && <option value="">Sin rol</option>}
            {editableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        );
      },
    },
    { key: 'since', header: 'Alta', cell: (u) => formatDate(u.created_at), hideOnMobile: true },
    {
      key: 'active',
      header: 'Activo',
      cell: (u) => (
        <Switch
          checked={u.active}
          disabled={!canEdit || u.id === currentUserId || (u.role?.key === 'super_admin' && !isSuper)}
          onChange={(v) => toggleActive(u, v)}
          label={`Activar ${u.full_name}`}
        />
      ),
    },
  ];

  const role = roleById(selectedRole);
  const roleLocked = !canEdit || role?.key === 'super_admin' || (role?.key === 'branch_admin' && !isSuper);
  const overrideCandidates = staff.filter((s) => s.id !== currentUserId && s.role?.key !== 'super_admin');
  const user = staff.find((s) => s.id === selectedUser);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { key: 'people', label: 'Personal', icon: Users },
            { key: 'roles', label: 'Matriz por rol', icon: Grid3X3 },
            { key: 'overrides', label: 'Excepciones por usuario', icon: KeyRound },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'people' && can('staff', 'create') && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Agregar personal
          </Button>
        )}
      </div>

      {tab === 'people' && (
        <Card>
          <DataTable columns={columns} rows={staff} rowKey={(u) => u.id} empty={{ icon: Users, title: 'Sin personal', description: 'Agrega a tu equipo de recepción, entrenadores y contabilidad.' }} />
        </Card>
      )}

      {tab === 'roles' && (
        <Card>
          <CardHeader
            title="Permisos por rol"
            description="Los cambios se aplican de inmediato a todos los usuarios del rol. Nadie puede otorgar un permiso que no posee."
            action={
              <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="w-56" aria-label="Rol">
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            }
          />
          {role?.key === 'super_admin' && (
            <p className="flex items-center gap-2 border-b border-line bg-copper-soft/40 px-5 py-2.5 text-sm">
              <ShieldCheck className="h-4 w-4 text-copper" /> El Super Admin tiene acceso total y no es editable.
            </p>
          )}
          <PermissionGrid
            isGranted={(m, a) => {
              const id = permId.get(`${m}.${a}`);
              return role?.key === 'super_admin' || (!!id && roleGrants.has(`${selectedRole}:${id}`));
            }}
            disabled={roleLocked}
            pendingPrefix="role"
            pendingCell={pendingCell}
            onToggle={(m, a, current) => toggleRoleCell(m, a, !current)}
          />
        </Card>
      )}

      {tab === 'overrides' && (
        <Card>
          <CardHeader
            title="Excepciones individuales"
            description="Concede o deniega acciones puntuales a un usuario sin cambiar su rol. Toca una celda para alternar: heredado → concedido → denegado."
            action={
              overrideCandidates.length > 0 ? (
                <Select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-64" aria-label="Usuario">
                  {overrideCandidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} · {s.role?.name ?? 'Sin rol'}
                    </option>
                  ))}
                </Select>
              ) : undefined
            }
          />
          {!user ? (
            <EmptyState icon={UserCog} title="No hay usuarios configurables" description="Agrega personal con un rol distinto de Super Admin para definir excepciones." />
          ) : (
            <>
              <div className="flex flex-wrap gap-4 border-b border-line px-5 py-2.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-olive-soft ring-1 ring-olive/40" /> Heredado del rol</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-ok" /> Concedido</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-danger" /> Denegado</span>
              </div>
              <PermissionGrid
                isGranted={(m, a) => {
                  const id = permId.get(`${m}.${a}`);
                  return !!id && !!user.role_id && roleGrants.has(`${user.role_id}:${id}`);
                }}
                override={(m, a) => {
                  const id = permId.get(`${m}.${a}`);
                  return id ? overrideMap.get(`${user.id}:${id}`) : undefined;
                }}
                disabled={!canEdit}
                pendingPrefix="user"
                pendingCell={pendingCell}
                onToggle={(m, a, _current, override) => cycleOverride(m, a, override)}
              />
            </>
          )}
        </Card>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Agregar personal" description="Se crea la cuenta con una contraseña temporal">
        <InviteForm
          roles={editableRoles}
          onCancel={() => setInviteOpen(false)}
          onDone={() => {
            setInviteOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}

function PermissionGrid({
  isGranted,
  override,
  disabled,
  onToggle,
  pendingCell,
  pendingPrefix,
}: {
  isGranted: (m: AppModule, a: PermAction) => boolean;
  override?: (m: AppModule, a: PermAction) => boolean | undefined;
  disabled: boolean;
  onToggle: (m: AppModule, a: PermAction, current: boolean, override: boolean | undefined) => void;
  pendingCell: string | null;
  pendingPrefix: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">Módulo</th>
            {PERM_ACTIONS.map((a) => (
              <th key={a} className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
                {ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {APP_MODULES.map((m) => (
            <tr key={m} className="border-b border-line last:border-0">
              <td className="px-5 py-3 font-medium">{MODULE_LABELS[m]}</td>
              {PERM_ACTIONS.map((a) => {
                const inherited = isGranted(m, a);
                const ov = override?.(m, a);
                const effective = ov ?? inherited;
                const busy = pendingCell === `${pendingPrefix}:${m}.${a}`;
                return (
                  <td key={a} className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => onToggle(m, a, inherited, ov)}
                      aria-pressed={effective}
                      aria-label={`${MODULE_LABELS[m]}: ${ACTION_LABELS[a]} ${effective ? 'permitido' : 'no permitido'}`}
                      className={cn(
                        'mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition',
                        busy && 'animate-pulse',
                        ov === true
                          ? 'border-ok bg-ok text-white'
                          : ov === false
                            ? 'border-danger bg-danger text-white'
                            : inherited
                              ? 'border-olive/40 bg-olive-soft text-olive'
                              : 'border-line text-muted/50',
                        !disabled && 'hover:scale-105',
                        disabled && 'cursor-not-allowed',
                      )}
                    >
                      {ov === false ? <X className="h-4 w-4" /> : effective ? <Check className="h-4 w-4" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InviteForm({ roles, onCancel, onDone }: { roles: Role[]; onCancel: () => void; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteStaffValues, unknown, z.output<typeof inviteStaffSchema>>({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: { full_name: '', email: '', password: '', role_key: 'receptionist' },
  });

  const submit = handleSubmit(async (values) => {
    const res = await inviteStaff(values);
    if (!res.ok) {
      Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) => v?.[0] && setError(k as keyof InviteStaffValues, { message: v[0] }));
      return void toast.error(res.error);
    }
    toast.success(res.message ?? 'Usuario creado');
    onDone();
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nombre completo" htmlFor="s-name" error={errors.full_name?.message}>
        <Input id="s-name" {...register('full_name')} />
      </Field>
      <Field label="Correo" htmlFor="s-email" error={errors.email?.message}>
        <Input id="s-email" type="email" autoComplete="off" {...register('email')} />
      </Field>
      <Field label="Contraseña temporal" htmlFor="s-pass" error={errors.password?.message} hint="Mínimo 10 caracteres con mayúscula, minúscula y número">
        <Input id="s-pass" type="text" autoComplete="new-password" {...register('password')} />
      </Field>
      <Field label="Rol" htmlFor="s-role" error={errors.role_key?.message}>
        <Select id="s-role" {...register('role_key')}>
          {roles.map((r) => (
            <option key={r.id} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Crear usuario
        </Button>
      </div>
    </form>
  );
}
