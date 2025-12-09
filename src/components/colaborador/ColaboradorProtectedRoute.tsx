import { Navigate, useLocation } from 'react-router-dom';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';
import { Skeleton } from '@/components/ui/skeleton';

interface ColaboradorProtectedRouteProps {
  children: React.ReactNode;
}

export function ColaboradorProtectedRoute({ children }: ColaboradorProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useColaboradorAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/colaborador" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
