export const APP_MODULES = [
  'members',
  'checkin',
  'pos',
  'finances',
  'routines',
  'reports',
  'staff',
  'settings',
] as const;

export const PERM_ACTIONS = ['create', 'read', 'update', 'delete', 'export'] as const;

export type AppModule = (typeof APP_MODULES)[number];
export type PermAction = (typeof PERM_ACTIONS)[number];
export type PermissionKey = `${AppModule}.${PermAction}`;

export type RoleKey = 'super_admin' | 'branch_admin' | 'receptionist' | 'trainer' | 'auditor';

export const MODULE_LABELS: Record<AppModule, string> = {
  members: 'Socios',
  checkin: 'Check-in',
  pos: 'POS y Caja',
  finances: 'Finanzas',
  routines: 'Rutinas y Clases',
  reports: 'Reportes',
  staff: 'Personal',
  settings: 'Ajustes',
};

export const ACTION_LABELS: Record<PermAction, string> = {
  create: 'Crear',
  read: 'Ver',
  update: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
};

export function permissionKey(module: AppModule, action: PermAction): PermissionKey {
  return `${module}.${action}`;
}

export function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}

export function isPermAction(value: string): value is PermAction {
  return (PERM_ACTIONS as readonly string[]).includes(value);
}
