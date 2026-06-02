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

  const signup: AuthContextValue['signup'] = async (input) => {
    await api.post('/auth/signup', input);
    await api.post('/auth/login', { email: input.email, password: input.password });
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    qc.setQueryData(['me'], null);
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
