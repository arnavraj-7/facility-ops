import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Comment,
  DashboardStats,
  Notification,
  Paginated,
  Ticket,
  TicketStatus,
  UserRef,
  User,
} from '@/types';

// ---- Tickets ----
export type TicketFilters = Record<string, string | undefined>;

export function useTickets(filters: TicketFilters) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return useQuery({
    queryKey: ['tickets', params],
    queryFn: async () => (await api.get<Paginated<Ticket>>('/tickets', { params })).data,
    placeholderData: (prev) => prev,
  });
}

/**
 * The newest tickets visible to the current user, for the dashboard feed.
 * Uses the same role-scoped /tickets endpoint as the board, so a ticket the
 * user just raised shows up here immediately.
 */
export function useRecentTickets(limit = 6) {
  return useQuery({
    queryKey: ['tickets', { recent: true, limit }],
    queryFn: async () =>
      (
        await api.get<Paginated<Ticket>>('/tickets', {
          params: { limit: String(limit), sort: 'createdAt', order: 'desc' },
        })
      ).data,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await api.get<{ ticket: Ticket }>(`/tickets/${id}`)).data.ticket,
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; description: string; priority?: string }) =>
      (await api.post<{ ticket: Ticket }>('/tickets', body)).data.ticket,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

function invalidateTicket(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  if (id) qc.invalidateQueries({ queryKey: ['ticket', id] });
}

export function useUpdateStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { status: TicketStatus; note?: string }) =>
      (await api.patch<{ ticket: Ticket }>(`/tickets/${id}/status`, body)).data.ticket,
    onSuccess: () => invalidateTicket(qc, id),
  });
}

export function useAssignEngineer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (engineerId: string) =>
      (await api.patch<{ ticket: Ticket }>(`/tickets/${id}/assign`, { engineerId })).data.ticket,
    onSuccess: () => invalidateTicket(qc, id),
  });
}

export function useApproveTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { isApproved: boolean; correctedTeam?: string }) =>
      (await api.post<{ ticket: Ticket }>(`/tickets/${id}/approve`, body)).data.ticket,
    onSuccess: () => invalidateTicket(qc, id),
  });
}

export function useBulkUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ticketIds: string[]; action: string; value: string }) =>
      (await api.post('/tickets/bulk', body)).data,
    onSuccess: () => invalidateTicket(qc),
  });
}

// ---- Comments ----
export function useComments(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['comments', ticketId],
    queryFn: async () => (await api.get<{ comments: Comment[] }>(`/tickets/${ticketId}/comments`)).data.comments,
    enabled: !!ticketId,
  });
}

export function useAddComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      (await api.post<{ comment: Comment }>(`/tickets/${ticketId}/comments`, { body })).data.comment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });
}

// ---- Analytics ----
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/analytics/dashboard')).data,
  });
}

// ---- Users / engineers ----
export function useEngineers(enabled = true) {
  return useQuery({
    queryKey: ['engineers'],
    queryFn: async () => (await api.get<{ engineers: UserRef[] }>('/users/engineers')).data.engineers,
    enabled,
  });
}

export function useTeam(enabled = true) {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => (await api.get<{ users: User[] }>('/users')).data.users,
    enabled,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      email: string;
      password: string;
      role: string;
      team?: string;
    }) => (await api.post('/users', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['engineers'] });
    },
  });
}

// ---- Sessions / devices ----
export interface ActiveSession {
  id: string;
  deviceLabel: string;
  ip: string;
  location: string;
  lastSeenAt: string;
  createdAt: string;
  stepUpVerified: boolean;
  current: boolean;
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () =>
      (await api.get<{ sessions: ActiveSession[]; max: number }>('/auth/sessions')).data,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ revoked: number }>('/auth/sessions/revoke-others')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

// ---- Notifications ----
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get<{ notifications: Notification[]; unread: number }>('/notifications')).data,
    refetchInterval: 60_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
