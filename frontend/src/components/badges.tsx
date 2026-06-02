import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Priority, TicketStatus } from '@/types';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_DOT: Record<TicketStatus, string> = {
  open: 'bg-muted-foreground',
  assigned: 'bg-blue-500',
  in_progress: 'bg-[hsl(var(--warning))]',
  pending_approval: 'bg-[hsl(var(--warning))]',
  resolved: 'bg-[hsl(var(--success))]',
  closed: 'bg-muted-foreground/60',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY_VARIANT: Record<Priority, 'secondary' | 'outline' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'outline',
  high: 'warning',
  critical: 'destructive',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className="capitalize">
      {priority}
    </Badge>
  );
}

export const statusLabel = (s: TicketStatus) => STATUS_LABEL[s];
