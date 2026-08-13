import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth';
import type { Role } from '@/types';
import { AppLayout } from '@/components/app-layout';
import { LoginPage } from '@/pages/login';
import { SignupPage } from '@/pages/signup';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { ResetPasswordPage } from '@/pages/reset-password';
import { SecurityPage } from '@/pages/security';
import { DashboardPage } from '@/pages/dashboard';
import { TicketsPage } from '@/pages/tickets';
import { TicketDetailPage } from '@/pages/ticket-detail';
import { ApprovalsPage } from '@/pages/approvals';
import { TeamPage } from '@/pages/team';

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, isLoading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />

      {/* Account recovery stays reachable while signed out. */}
      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />}
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route
          path="/approvals"
          element={
            <RoleGate roles={['manager', 'admin']}>
              <ApprovalsPage />
            </RoleGate>
          }
        />
        <Route
          path="/team"
          element={
            <RoleGate roles={['admin']}>
              <TeamPage />
            </RoleGate>
          }
        />
      </Route>

      <Route path="*" element={isLoading ? <FullScreenLoader /> : <Navigate to="/" replace />} />
    </Routes>
  );
}
