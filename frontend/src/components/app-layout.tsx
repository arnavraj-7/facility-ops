import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  ShieldCheck,
  Users,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import type { Role } from '@/types';
import { useAuth } from '@/context/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsBell } from '@/components/notifications-bell';
import { UserMenu } from '@/components/user-menu';
import { CreateTicketDialog } from '@/components/create-ticket-dialog';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tickets', label: 'Tickets', icon: TicketIcon },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck, roles: ['manager', 'admin'] },
  { to: '/team', label: 'Team', icon: Users, roles: ['admin'] },
];

export function AppLayout() {
  const { user, tenant } = useAuth();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Live notifications over SSE — toast + invalidate the relevant queries so
  // boards and counters update without a manual refresh.
  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/v1/notifications/stream', { withCredentials: true });
    es.addEventListener('notification', (e) => {
      try {
        const n = JSON.parse((e as MessageEvent).data);
        toast(n.title, { description: n.body });
      } catch {
        /* ignore malformed */
      }
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
    return () => es.close();
  }, [user?.id, qc]);

  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Facility Ops</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-4">
        <p className="truncate text-xs font-medium">{tenant?.name ?? 'Facility'}</p>
        <p className="text-[11px] text-muted-foreground">Command Center</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-card lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 border-r bg-card">
            <button
              className="absolute right-3 top-4 text-muted-foreground"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <CreateTicketDialog />
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
