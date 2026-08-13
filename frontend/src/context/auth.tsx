import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Tenant, User } from '@/types';

interface MeResponse {
  user: User;
  tenant: Tenant | null;
}

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    await api.post('/auth/login', { email, password });
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
