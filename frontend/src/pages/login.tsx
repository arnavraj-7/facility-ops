import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type StepUpChallenge } from '@/context/auth';
import { apiError } from '@/lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if ('stepUpRequired' in result) {
        // Password was right, but the risk engine wants a second factor.
        setChallenge(result);
        return;
      }
      navigate('/');
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('admin@facility.dev');
    setPassword('Password123');
  };

  if (challenge) {
    return <StepUpForm challenge={challenge} onCancel={() => setChallenge(null)} />;
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to the Command Center"
      footer={
        <>
          No account?{' '}
          <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@facility.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      <button
        onClick={fillDemo}
        className="mt-4 w-full rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
      >
        Use demo admin · admin@facility.dev / Password123
      </button>
    </AuthShell>
  );
}

/**
 * Step-up verification. Shown only when the risk engine scored the sign-in
 * above the challenge threshold — a new device combined with a new country,
 * or travel too fast to be physically possible.
 */
function StepUpForm({
  challenge,
  onCancel,
}: {
  challenge: StepUpChallenge;
  onCancel: () => void;
}) {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(challenge.challengeId, code);
      toast.success('Verified — welcome back');
      navigate('/');
    } catch (err) {
      toast.error(apiError(err));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Extra verification"
      subtitle={`We sent a 6-digit code to ${challenge.maskedEmail}`}
      footer={
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> Back to sign in
        </button>
      }
    >
      <div className="mb-4 flex gap-3 rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] p-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
        <div className="space-y-1 text-xs">
          <p className="font-medium text-foreground">This sign-in looked unusual</p>
          <p className="text-muted-foreground">
            It came from {challenge.reason}. Enter the code we emailed you to continue.
          </p>
          {challenge.detail?.travel ? (
            <p className="text-muted-foreground">
              {(challenge.detail.travel as { fromCity: string }).fromCity} →{' '}
              {(challenge.detail.travel as { toCity: string }).toCity} ·{' '}
              {(challenge.detail.travel as { km: number }).km.toLocaleString()} km apart
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center font-mono text-lg tracking-[0.4em]"
            autoFocus
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify and sign in
        </Button>
      </form>

      {/* Dev convenience: the API returns the code outside production so the
          flow can be demoed without digging through the server log. */}
      {challenge.devCode && (
        <p className="mt-4 rounded-md border border-dashed py-2 text-center text-xs text-muted-foreground">
          Dev mode · code is <span className="font-mono font-medium">{challenge.devCode}</span>
        </p>
      )}
    </AuthShell>
  );
}
