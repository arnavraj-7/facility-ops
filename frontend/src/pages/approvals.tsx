import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PriorityBadge } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTickets } from '@/hooks/queries';
import { timeAgo } from '@/lib/utils';

export function ApprovalsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useTickets({ status: 'pending_approval', limit: '50' });
  const tickets = data?.tickets ?? [];

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Critical tickets the AI flagged for human review before routing."
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">All clear</p>
            <p className="text-sm text-muted-foreground">No tickets are waiting for approval.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <span className="font-mono text-xs text-muted-foreground">#{t.ticketNumber}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Proposed: {(t.assignedTeam ?? 'General_Support').replace(/_/g, ' ')} · raised{' '}
                    {timeAgo(t.createdAt)}
                  </p>
                </div>
                <PriorityBadge priority={t.priority} />
                <Button size="sm" onClick={() => navigate(`/tickets/${t.id}`)}>
                  Review
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
