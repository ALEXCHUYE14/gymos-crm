'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { SessionProvider, useCan, useSession } from '@/stores/session-store';
import { useUiStore } from '@/stores/ui-store';
import type { BusinessSettings, ProfileWithRole } from '@/types/database';
import type { PermissionKey } from '@/types/permissions';
import { Avatar } from '@/components/ui/feedback';
import { NAV_ITEMS, type NavItem } from './nav-config';
import defaultLogo from '@/assets/brand/logo-circle.webp';

interface AppShellProps {
  children: ReactNode;
  profile: ProfileWithRole;
  permissions: PermissionKey[];
  settings: BusinessSettings;
  logoUrl: string | null;
  paymentQrUrl: string | null;
}

export function AppShell({ children, ...session }: AppShellProps) {
  return (
    <SessionProvider {...session}>
      <ShellFrame>{children}</ShellFrame>
    </SessionProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const { profile, settings, logoUrl } = useSession();
  const can = useCan();
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  const visible = useMemo(
    () => NAV_ITEMS.filter((i) => !i.requires || can(i.requires.module, i.requires.action)),
    [can],
  );
  const mobilePrimary = [...visible].sort((a, b) => a.mobilePriority - b.mobilePriority).slice(0, 4);
  const mobileRest = visible.filter((i) => !mobilePrimary.includes(i));

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const businessName = settings.name;
  const logo = logoUrl;

  const signOut = async () => {
    const { error } = await getSupabaseBrowser().auth.signOut();
    if (error) {
      toast.error('No se pudo cerrar sesión');
      return;
    }
    router.replace('/login');
    router.refresh();
  };

  const groups: NavItem['group'][] = ['operación', 'gestión', 'administración'];

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center gap-3 border-b border-line px-4', collapsed && 'justify-center px-0')}>
          <BrandMark logo={logo} name={businessName} />
          {!collapsed && <span className="truncate font-display text-sm font-semibold">{businessName}</span>}
        </div>
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
          {groups.map((group) => {
            const items = visible.filter((i) => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-5">
                {!collapsed && (
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted/80">{group}</p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-0',
                          isActive(item.href)
                            ? 'bg-olive-soft text-olive'
                            : 'text-muted hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className={cn('flex items-center gap-3', collapsed && 'flex-col')}>
            <Avatar name={profile.full_name || profile.email} size={34} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
                <p className="truncate text-xs text-muted">{profile.role?.name ?? 'Sin rol'}</p>
              </div>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-muted hover:bg-surface-2"
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && 'Colapsar'}
          </button>
        </div>
      </aside>

      {/* Top bar móvil/tablet */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark logo={logo} name={businessName} />
          <span className="truncate font-display text-sm font-semibold">{businessName}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className={cn('pb-24 transition-[padding] duration-200 lg:pb-10', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Bottom nav móvil */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden"
        aria-label="Navegación móvil"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5">
          {mobilePrimary.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium',
                  isActive(item.href) ? 'text-olive' : 'text-muted',
                )}
              >
                <item.icon className="h-5 w-5" strokeWidth={isActive(item.href) ? 2.25 : 1.75} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          ))}
          {mobileRest.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex w-full flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-muted"
                aria-haspopup="dialog"
              >
                <Menu className="h-5 w-5" strokeWidth={1.75} />
                Más
              </button>
            </li>
          )}
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="pb-safe absolute inset-x-0 bottom-0 animate-pop-in rounded-t-2xl border-t border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">Más módulos</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-muted" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {mobileRest.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border border-line px-2 py-4 text-center text-xs font-medium',
                      isActive(item.href) ? 'bg-olive-soft text-olive' : 'text-ink',
                    )}
                  >
                    <item.icon className="h-5 w-5" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMark({ logo, name }: { logo: string | null; name: string }) {
  // Sin logo personalizado se usa el logo predeterminado de la marca
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={logo ?? defaultLogo.src}
      alt={name}
      className={cn('h-9 w-9 shrink-0 object-contain', logo ? 'rounded-lg border border-line' : 'rounded-full border-2 border-black')}
    />
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
