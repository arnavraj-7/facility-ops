import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "2h ago", "3d ago", "just now" — compact relative time. */
export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Human duration from milliseconds, e.g. "4h 12m" or "2d 3h". */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Signed countdown to a deadline: "in 3h" or "2h overdue". */
export function slaCountdown(due?: string | null): { label: string; overdue: boolean } {
  if (!due) return { label: '—', overdue: false };
  const ms = new Date(due).getTime() - Date.now();
  const overdue = ms < 0;
  return { label: overdue ? `${formatDuration(-ms)} over` : `${formatDuration(ms)} left`, overdue };
}

export function initials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
