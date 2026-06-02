import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, Inbox, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { CreateTicketDialog } from '@/components/create-ticket-dialog';
import { useDashboard } from '@/hooks/queries';
import { useAuth } from '@/context/auth';
import { cn, formatDuration } from '@/lib/utils';
import type { Priority, TicketStatus } from '@/types';

const STATUS_ORDER: TicketStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'pending_approval',
  'resolved',
  'closed',
];
const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  pending_approval: 'Pending approval',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low'];
const PRIORITY_COLOR: Record<Priority, string> = {
  critical: 'bg-destructive',
  high: 'bg-[hsl(var(--warning))]',
  medium: 'bg-blue-500',
  low: 'bg-muted-foreground',
};

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md',
            tone === 'warning'
              ? 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]'
              : tone === 'success'
                ? 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useDashboard();

  const maxStatus = data ? Math.max(1, ...STATUS_ORDER.map((s) => data.byStatus[s] ?? 0)) : 1;
  const maxPriority = data ? Math.max(1, ...PRIORITY_ORDER.map((p) => data.byPriority[p] ?? 0)) : 1;
  const maxTeam = data ? Math.max(1, ...data.byTeam.map((t) => t.count)) : 1;

  return (
    <div>
      <PageHeader
        title={`Welcome${user ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Operational overview of the Command Center."
        actions={<CreateTicketDialog />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)
        ) : (
          <>
            <StatCard label="Open tickets" value={data.open} icon={Inbox} hint={`${data.total} total`} />
            <StatCard
              label="Overdue (SLA)"
              value={data.overdue}
              icon={AlertTriangle}
              tone={data.overdue > 0 ? 'warning' : 'default'}
              hint="past resolution target"
            />
            <StatCard
              label="Resolved today"
              value={data.resolvedToday}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Avg resolution"
              value={data.avgResolutionMs ? formatDuration(data.avgResolutionMs) : '—'}
              icon={Timer}
              hint="time to resolve"
            />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Tickets raised · last 7 days</CardTitle>
          </CardHeader>
          <CardContent className="h-[240px] text-foreground">
            {isLoading || !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d.slice(5)}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--border))' }}
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="created"
                    stroke="currentColor"
                    strokeWidth={2}
                    fill="url(#fill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !data
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)
              : STATUS_ORDER.map((s) => (
                  <div key={s} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                      <span className="font-medium tabular-nums">{data.byStatus[s] ?? 0}</span>
                    </div>
                    <Bar value={data.byStatus[s] ?? 0} max={maxStatus} className="bg-foreground/70" />
                  </div>
                ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Priority */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !data
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)
              : PRIORITY_ORDER.map((p) => (
                  <div key={p} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-muted-foreground">{p}</span>
                      <span className="font-medium tabular-nums">{data.byPriority[p] ?? 0}</span>
                    </div>
                    <Bar value={data.byPriority[p] ?? 0} max={maxPriority} className={PRIORITY_COLOR[p]} />
                  </div>
                ))}
          </CardContent>
        </Card>

        {/* Team workload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Team workload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)
            ) : data.byTeam.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No assignments yet</p>
            ) : (
              data.byTeam.map((t) => (
                <div key={t.team} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">{t.team.replace(/_/g, ' ')}</span>
                    <span className="font-medium tabular-nums">{t.count}</span>
                  </div>
                  <Bar value={t.count} max={maxTeam} className="bg-foreground/70" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/tickets" className="underline-offset-4 hover:underline">
          View all tickets →
        </Link>
      </p>
    </div>
  );
}
