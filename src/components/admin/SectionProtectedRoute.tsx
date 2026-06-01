import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminPermissions, type AdminSection } from '@/hooks/useAdminPermissions';
import { ShieldOff } from 'lucide-react';

interface Props {
  section: AdminSection;
  children: React.ReactNode;
}

const SectionProtectedRoute: React.FC<Props> = ({ section, children }) => {
  const { hasSection, firstAllowed, isManager, isLoading } = useAdminPermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (hasSection(section)) {
    return <>{children}</>;
  }

  // Manage-team-only page: don't redirect away if user has any access
  if (section === '_manage_team' && !isManager) {
    if (firstAllowed) {
      return <Navigate to={`/admin/${firstAllowed}`} replace />;
    }
  } else if (firstAllowed) {
    return <Navigate to={`/admin/${firstAllowed}`} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <ShieldOff className="h-16 w-16 text-orange-500 mx-auto" />
        <h1 className="text-2xl font-bold text-foreground">Sem acesso</h1>
        <p className="text-muted-foreground">
          Sua conta de admin ainda não tem permissão para nenhuma seção. Peça a um gestor da equipe
          para liberar o acesso.
        </p>
      </div>
    </div>
  );
};

export default SectionProtectedRoute;
