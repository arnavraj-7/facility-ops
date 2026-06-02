import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { CreateTicketDialog } from '@/components/create-ticket-dialog';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBulkUpdate, useEngineers, useTickets } from '@/hooks/queries';
import { useAuth } from '@/context/auth';
import { cn, slaCountdown, timeAgo } from '@/lib/utils';
import type { Ticket, UserRef } from '@/types';

const PAGE_SIZE = 20;

export function TicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'manager' || user?.role === 'admin';
  const isEngineer = user?.role === 'engineer';

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debounced, status, priority, mine, overdue]);

  const filters = useMemo(
    () => ({
      search: debounced || undefined,
      status: status === 'all' ? undefined : status,
      priority: priority === 'all' ? undefined : priority,
      mine: mine ? 'true' : undefined,
      overdue: overdue ? 'true' : undefined,
      page: String(page),
      limit: String(PAGE_SIZE),
    }),
    [debounced, status, priority, mine, overdue, page]
  );

  const { data, isLoading, isFetching } = useTickets(filters);
  const { data: engineers } = useEngineers(canManage);
  const bulk = useBulkUpdate();

  const tickets = data?.tickets ?? [];
  const allSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id));

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(tickets.map((t) => t.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runBulk = async (action: string, value: string) => {
    try {
      const res = await bulk.mutateAsync({ ticketIds: [...selected], action, value });
      toast.success(`Updated ${res.modified} ticket(s)`);
      setSelected(new Set());
    } catch {
      toast.error('Bulk update failed');
    }
  };

  const hasFilters = status !== 'all' || priority !== 'all' || mine || overdue || !!search;

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Every malfunction, complaint and fix across the facility."
        actions={<CreateTicketDialog />}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="pending_approval">Pending approval</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={overdue ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOverdue((v) => !v)}
        >
          Overdue
        </Button>
        {isEngineer && (
          <Button variant={mine ? 'default' : 'outline'} size="sm" onClick={() => setMine((v) => !v)}>
            Assigned to me
          </Button>
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('all');
              setPriority('all');
              setMine(false);
              setOverdue(false);
            }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {canManage && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 px-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => runBulk('status', v)}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Set status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => runBulk('priority', v)}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Set priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => runBulk('assign', v)}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Assign to" />
              </SelectTrigger>
              <SelectContent>
                {(engineers ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className={cn('overflow-hidden', isFetching && 'opacity-70')}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
              )}
              <TableHead className="w-14">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-24">Priority</TableHead>
              <TableHead className="w-40">Assignee</TableHead>
              <TableHead className="w-28">SLA</TableHead>
              <TableHead className="w-24 text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={canManage ? 8 : 7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : tickets.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={canManage ? 8 : 7} className="h-32 text-center text-muted-foreground">
                  No tickets match your filters.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((t) => <Row key={t.id} t={t} canManage={canManage} selected={selected.has(t.id)} onToggle={toggleOne} onOpen={() => navigate(`/tickets/${t.id}`)} />)
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.pages} · {data.total} tickets
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  t,
  canManage,
  selected,
  onToggle,
  onOpen,
}: {
  t: Ticket;
  canManage: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: () => void;
}) {
  const engineer = t.assignedEngineer as UserRef | null;
  const sla = slaCountdown(t.slaDueAt);
  const terminal = t.status === 'resolved' || t.status === 'closed';

  return (
    <TableRow className="cursor-pointer" data-state={selected ? 'selected' : undefined} onClick={onOpen}>
      {canManage && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={() => onToggle(t.id)} aria-label="Select row" />
        </TableCell>
      )}
      <TableCell className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium leading-tight">{t.title}</span>
          <span className="text-xs text-muted-foreground">{t.category}</span>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={t.status} />
      </TableCell>
      <TableCell>
        <PriorityBadge priority={t.priority} />
      </TableCell>
      <TableCell className="text-sm">
        {engineer ? engineer.name : <span className="text-muted-foreground">Unassigned</span>}
      </TableCell>
      <TableCell>
        {terminal ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span
            className={cn('text-xs tabular-nums', sla.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}
          >
            {sla.label}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(t.createdAt)}</TableCell>
    </TableRow>
  );
}
