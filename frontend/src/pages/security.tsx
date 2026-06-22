import { Loader2, LogOut, MapPin, Monitor, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@/hooks/queries';
import { timeAgo } from '@/lib/utils';
import { apiError } from '@/lib/api';

/**
 * Active devices. Every row is a live session in the registry, which is also
 * what the concurrent-device limit counts — so signing in on a fourth device
 * visibly drops the least-recently-used one from this list.
 */
export function SecurityPage() {
  const { data, isLoading } = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const sessions = data?.sessions ?? [];
  const max = data?.max ?? 3;
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div>
      <PageHeader
        title="Security"
        description="Devices signed in to your account."
        actions={
          others > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={revokeOthers.isPending}
              onClick={() =>
                revokeOthers.mutate(undefined, {
                  onSuccess: (res) => toast.success(`Signed out ${res.revoked} device(s)`),
                  onError: (err) => toast.error(apiError(err)),
                })
              }
            >
              {revokeOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign out other devices
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You can be signed in on <span className="font-medium text-foreground">{max}</span>{' '}
            devices at once. Signing in on another one automatically signs out whichever device
            you used least recently. Sign-ins from an unrecognised device in a new location need
            an emailed verification code.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Active devices · {sessions.length} of {max}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Monitor className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{s.deviceLabel}</span>
                      {s.current && <Badge variant="secondary">This device</Badge>}
                      {s.stepUpVerified && (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </Badge>
                      )}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {s.location || 'Unknown location'} · {s.ip || 'no ip'} · active{' '}
                      {timeAgo(s.lastSeenAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        revoke.mutate(s.id, {
                          onSuccess: () => toast.success('Device signed out'),
                          onError: (err) => toast.error(apiError(err)),
                        })
                      }
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
