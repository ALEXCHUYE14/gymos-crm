import {
  BarChart3,
  Boxes,
  Dumbbell,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AppModule, PermAction } from '@/types/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permiso requerido para ver el ítem; undefined = cualquier usuario autenticado */
  requires?: { module: AppModule; action: PermAction };
  /** Prioridad en la barra inferior móvil (menor = primero) */
  mobilePriority: number;
  group: 'operación' | 'gestión' | 'administración';
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, mobilePriority: 1, group: 'operación' },
  { href: '/checkin', label: 'Check-in', icon: ScanLine, requires: { module: 'checkin', action: 'create' }, mobilePriority: 0, group: 'operación' },
  { href: '/pos', label: 'Punto de venta', icon: ShoppingCart, requires: { module: 'pos', action: 'create' }, mobilePriority: 2, group: 'operación' },
  { href: '/members', label: 'Socios', icon: Users, requires: { module: 'members', action: 'read' }, mobilePriority: 3, group: 'operación' },
  { href: '/cash', label: 'Caja', icon: Wallet, requires: { module: 'pos', action: 'read' }, mobilePriority: 5, group: 'gestión' },
  { href: '/products', label: 'Productos', icon: Boxes, requires: { module: 'pos', action: 'read' }, mobilePriority: 8, group: 'gestión' },
  { href: '/plans', label: 'Planes', icon: Tags, requires: { module: 'settings', action: 'read' }, mobilePriority: 9, group: 'gestión' },
  { href: '/routines', label: 'Rutinas y clases', icon: Dumbbell, requires: { module: 'routines', action: 'read' }, mobilePriority: 4, group: 'gestión' },
  { href: '/reports', label: 'Reportes', icon: BarChart3, requires: { module: 'finances', action: 'read' }, mobilePriority: 6, group: 'gestión' },
  { href: '/staff', label: 'Personal y permisos', icon: ShieldCheck, requires: { module: 'staff', action: 'read' }, mobilePriority: 10, group: 'administración' },
  { href: '/settings', label: 'Ajustes', icon: Settings, requires: { module: 'settings', action: 'read' }, mobilePriority: 11, group: 'administración' },
];
