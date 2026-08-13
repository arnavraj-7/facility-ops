import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Tenant, User } from '@/types';

interface MeResponse {
  user: User;
  tenant: Tenant | null;
}

/**
 * A risk-flagged login does not produce a session. The API returns a challenge
 * the user must clear with an emailed one-time code.
 */
export interface StepUpChallenge {
  stepUpRequired: true;
  challengeId: string;
  reason: string;
  riskScore: number;
  riskReasons: string[];
  maskedEmail: string;
  detail?: Record<string, unknown>;
  devCode?: string; // development convenience only
}

type LoginResult = { ok: true } | StepUpChallenge;

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  signup: (input: { name: string; email: string; password: string; organization?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<MeResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api.get<MeResponse>('/auth/me');
        return res.data;
      } catch {
        return null; // not authenticated
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login: AuthContextValue['login'] = async (email, password) => {
    const res = await api.post<{ stepUpRequired?: boolean } & Partial<StepUpChallenge>>(
      '/auth/login',
      { email, password }
    );

    // Correct password, but the risk engine wants a second factor. No session
    // exists yet — hand the challenge back for the caller to complete.
    if (res.data.stepUpRequired) return res.data as StepUpChallenge;

    await qc.invalidateQueries({ queryKey: ['me'] });
    return { ok: true };
  };

  const verifyOtp: AuthContextValue['verifyOtp'] = async (challengeId, code) => {
    await api.post('/auth/verify-otp', { challengeId, code });
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  // Signup creates the tenant AND opens the session in one round-trip — there
  // is no email-verification step to wait on.
  const signup: AuthContextValue['signup'] = async (input) => {
    await api.post('/auth/signup', input);
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  const logout = async () => {
    // Clear local auth state even if the request fails — someone who clicked
    // "sign out" must end up signed out, network error or not.
    try {
      await api.post('/auth/logout');
    } catch {
      /* the cookie is dead either way; fall through and clear locally */
    }

    // An in-flight /auth/me would otherwise resolve after this and restore the
    // old user, putting us right back on the dashboard.
    await qc.cancelQueries({ queryKey: ['me'] });

    // Write the signed-out state onto the query this provider is subscribed
    // to. Doing qc.clear() here instead removes that query out from under the
    // live observer, which can leave the provider still rendering the previous
    // user — and then /login immediately redirects back to /.
    qc.setQueryData(['me'], null);

    // Drop everything else so the next person to log in never sees a flash of
    // the previous user's tickets.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  const value: AuthContextValue = {
    user: data?.user ?? null,
    tenant: data?.tenant ?? null,
    isLoading,
    login,
    verifyOtp,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
