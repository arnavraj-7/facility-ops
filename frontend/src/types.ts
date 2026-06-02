export type Role = 'user' | 'engineer' | 'manager' | 'admin';

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'pending_approval'
  | 'resolved'
  | 'closed';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  team?: string | null;
  status?: string;
  createdAt?: string;
  lastLoginAt?: string | null;
  tenantId?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface UserRef {
  id: string;
  _id?: string;
  name: string;
  email: string;
  team?: string | null;
  role?: Role;
}

export interface StatusEvent {
  from?: string;
  to: string;
  by?: string;
  note?: string;
  at: string;
}

export interface Ticket {
  id: string;
  tenantId: string;
  ticketNumber: number;
  title: string;
  description: string;
  createdBy: UserRef | string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  assignedEngineer?: UserRef | null;
  assignedTeam?: string | null;
  summary?: string;
  requiresHardwareDispatch?: boolean;
  aiRouted?: boolean;
  threadId?: string | null;
  humanModified?: boolean;
  slaDueAt?: string | null;
  slaBreached?: boolean;
  isOverdue?: boolean;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  statusHistory?: StatusEvent[];
  commentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  author?: UserRef | null;
  body: string;
  type: 'comment' | 'system';
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  open: number;
  overdue: number;
  resolvedToday: number;
  avgResolutionMs: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<Priority, number>;
  byTeam: { team: string; count: number }[];
  trend: { date: string; created: number }[];
}

export interface Paginated<T> {
  tickets: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
