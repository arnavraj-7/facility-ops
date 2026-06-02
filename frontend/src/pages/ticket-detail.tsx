import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Loader2,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAddComment,
  useApproveTicket,
  useAssignEngineer,
  useComments,
  useEngineers,
  useTicket,
  useUpdateStatus,
} from '@/hooks/queries';
import { useAuth } from '@/context/auth';
import { cn, initials, slaCountdown, timeAgo } from '@/lib/utils';
import type { Comment, TicketStatus, UserRef } from '@/types';

const TEAMS = [
  'Database_Admin_Squad',
  'Network_Infrastructure_Team',
  'Core_Platform_Engineers',
  'Field_Hardware_Technicians',
  'General_Support',
];

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ticket, isLoading } = useTicket(id);
  const { data: comments } = useComments(id);

  const canManage = user?.role === 'manager' || user?.role === 'admin';
  const engineer = ticket?.assignedEngineer as UserRef | null;
  const isAssignedToMe = user?.role === 'engineer' && engineer?.id === user.id;
  const canChangeStatus = canManage || isAssignedToMe;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Ticket not found.</p>
        <Button variant="link" onClick={() => navigate('/tickets')}>
          Back to tickets
        </Button>
      </div>
    );
  }

  const sla = slaCountdown(ticket.slaDueAt);
  const terminal = ticket.status === 'resolved' || ticket.status === 'closed';
  const createdBy = ticket.createdBy as UserRef;

  return (
    <div>
      <Link
        to="/tickets"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tickets
      </Link>

      <PageHeader
        title={ticket.title}
        description={`#${ticket.ticketNumber} · ${ticket.category} · opened ${timeAgo(ticket.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {ticket.description}
              </p>
            </CardContent>
          </Card>

          {ticket.status === 'pending_approval' && canManage && (
            <ApprovalPanel ticketId={ticket.id} currentTeam={ticket.assignedTeam ?? ''} />
          )}

          <ActivityFeed ticketId={ticket.id} comments={comments ?? []} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Manage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Status</label>
                {canChangeStatus ? (
                  <StatusControl ticketId={ticket.id} status={ticket.status} />
                ) : (
                  <div>
                    <StatusBadge status={ticket.status} />
                  </div>
                )}
              </div>

              {canManage && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Assigned engineer</label>
                  <AssignControl ticketId={ticket.id} current={engineer?.id} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI routing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Bot className="h-4 w-4 text-muted-foreground" /> AI triage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Meta label="Routed team" value={(ticket.assignedTeam ?? 'General_Support').replace(/_/g, ' ')} />
              {ticket.summary && <Meta label="Summary" value={ticket.summary} />}
              <div className="flex flex-wrap gap-2">
                <Badge variant={ticket.aiRouted ? 'secondary' : 'outline'} className="gap-1">
                  {ticket.aiRouted ? 'AI routed' : 'Heuristic routed'}
                </Badge>
                {ticket.humanModified && <Badge variant="outline">Human modified</Badge>}
                {ticket.requiresHardwareDispatch && (
                  <Badge variant="warning" className="gap-1">
                    <Wrench className="h-3 w-3" /> Hardware dispatch
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SLA + meta */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" /> SLA & details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Resolution SLA</span>
                {terminal ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Met
                  </Badge>
                ) : ticket.slaBreached || sla.overdue ? (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" /> {sla.label}
                  </Badge>
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">{sla.label}</span>
                )}
              </div>
              <Separator />
              <Meta label="Reported by" value={createdBy?.name ?? '—'} />
              <Meta label="Created" value={new Date(ticket.createdAt).toLocaleString()} />
              {ticket.resolvedAt && (
                <Meta label="Resolved" value={new Date(ticket.resolvedAt).toLocaleString()} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function StatusControl({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const update = useUpdateStatus(ticketId);
  return (
    <Select
      value={status}
      onValueChange={(v) =>
        update.mutate(
          { status: v as TicketStatus },
          {
            onSuccess: () => toast.success('Status updated'),
            onError: () => toast.error('Could not update status'),
          }
        )
      }
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="assigned">Assigned</SelectItem>
        <SelectItem value="in_progress">In progress</SelectItem>
        <SelectItem value="resolved">Resolved</SelectItem>
        <SelectItem value="closed">Closed</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AssignControl({ ticketId, current }: { ticketId: string; current?: string }) {
  const { data: engineers } = useEngineers();
  const assign = useAssignEngineer(ticketId);
  return (
    <Select
      value={current ?? ''}
      onValueChange={(v) =>
        assign.mutate(v, {
          onSuccess: () => toast.success('Engineer assigned'),
          onError: () => toast.error('Could not assign'),
        })
      }
    >
      <SelectTrigger>
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {(engineers ?? []).map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
            {e.team ? ` · ${e.team.replace(/_/g, ' ')}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ApprovalPanel({ ticketId, currentTeam }: { ticketId: string; currentTeam: string }) {
  const approve = useApproveTicket(ticketId);
  const [team, setTeam] = useState(currentTeam || TEAMS[0]);

  return (
    <Card className="border-[hsl(var(--warning)/0.4)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" /> Approval required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The AI flagged this critical ticket for human review. Approve its routing or override the team.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(
                { isApproved: false, correctedTeam: team },
                { onSuccess: () => toast.success('Re-routed') }
              )
            }
          >
            Override
          </Button>
          <Button
            size="sm"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate({ isApproved: true }, { onSuccess: () => toast.success('Approved') })
            }
          >
            {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Approve routing
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ ticketId, comments }: { ticketId: string; comments: Comment[] }) {
  const add = useAddComment(ticketId);
  const [body, setBody] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    add.mutate(body, {
      onSuccess: () => setBody(''),
      onError: () => toast.error('Could not post comment'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
          {comments.map((c) =>
            c.type === 'system' ? (
              <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-border" />
                <span>{c.body}</span>
                <span className="ml-auto shrink-0">{timeAgo(c.createdAt)}</span>
              </div>
            ) : (
              <div key={c.id} className="flex gap-3">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px]">{initials(c.author?.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.author?.name ?? 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>
                </div>
              </div>
            )
          )}
        </div>

        <Separator />

        <form onSubmit={submit} className="space-y-2">
          <Textarea
            placeholder="Add a comment…"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={add.isPending || !body.trim()}>
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Comment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
