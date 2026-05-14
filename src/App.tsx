import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ColaboradorAuthProvider } from "@/contexts/ColaboradorAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ColaboradorProtectedRoute } from "@/components/colaborador/ColaboradorProtectedRoute";
import Index from "./pages/Index";
import EventDetails from "./pages/EventDetails";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import DashboardEventos from "./pages/DashboardEventos";
import CriarEvento from "./pages/CriarEvento";
import EditarEvento from "./pages/EditarEvento";
import EventDashboard from "./pages/EventDashboard";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import Financeiro from "./pages/Financeiro";
import FinanceiroEvento from "./pages/FinanceiroEvento";
import MeusIngressos from "./pages/MeusIngressos";
import MinhaConta from "./pages/MinhaConta";
import ColaboradoresManager from "./pages/ColaboradoresManager";
import ColaboradorLogin from "./pages/colaborador/ColaboradorLogin";
import ColaboradorEventos from "./pages/colaborador/ColaboradorEventos";
import ColaboradorEvento from "./pages/colaborador/ColaboradorEvento";
import GuestListPublicForm from "./pages/GuestListPublicForm";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade";
import TermosDeUso from "./pages/TermosDeUso";
import PoliticaReembolso from "./pages/PoliticaReembolso";
import AreaDoProdutor from "./pages/AreaDoProdutor";
import ProducerAuth from "./pages/ProducerAuth";
import ProducerSettings from "./pages/ProducerSettings";
import AdminProtectedRoute from "./components/admin/AdminProtectedRoute";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProdutores from "./pages/admin/AdminProdutores";
import AdminProdutorDetalhe from "./pages/admin/AdminProdutorDetalhe";
import AdminRepasses from "./pages/admin/AdminRepasses";
import AdminConfiguracoes from "./pages/admin/AdminConfiguracoes";
import AdminSaude from "./pages/admin/AdminSaude";
import { AdminLayout } from "./components/admin/AdminLayout";

// Preserves query string when redirecting legacy /auth → /login
// (ex.: /auth?mode=forgot → /login?mode=forgot)
const LegacyAuthRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/login${location.search}`} replace />;
};

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" theme="dark" />
        <BrowserRouter>
          <AuthProvider>
            <ColaboradorAuthProvider>
              <Routes>
                {/* Public */}
                <Route path="/" element={<Index />} />
                <Route path="/evento/:id" element={<EventDetails />} />
                <Route path="/checkout" element={<Navigate to="/" replace />} />
                {/* Mantido temporariamente para back_url legacy do Mercado Pago.
                    Auditar logs e remover após confirmar 0 hits recentes. */}
                <Route path="/checkout/sucesso" element={<CheckoutSuccess />} />
                <Route path="/login" element={<Auth />} />
                <Route path="/reset-password" element={<Navigate to="/login?mode=forgot" replace />} />
                <Route path="/privacidade" element={<PoliticaPrivacidade />} />
                <Route path="/termos" element={<TermosDeUso />} />

                {/* Client Protected */}
                <Route path="/meus-ingressos" element={<ProtectedRoute><MeusIngressos /></ProtectedRoute>} />
                <Route path="/minha-conta" element={<ProtectedRoute><MinhaConta /></ProtectedRoute>} />

                {/* Producer Area (public) */}
                <Route path="/area-do-produtor" element={<AreaDoProdutor />} />
                <Route path="/area-do-produtor/login" element={<ProducerAuth />} />
                <Route path="/area-do-produtor/cadastro" element={<ProducerAuth />} />

                {/* Producer Dashboard (protected) */}
                <Route path="/produtor/dashboard" element={<ProtectedRoute requiredRole="produtor"><Dashboard /></ProtectedRoute>} />
                <Route path="/produtor/eventos" element={<ProtectedRoute requiredRole="produtor"><DashboardEventos /></ProtectedRoute>} />
                <Route path="/produtor/eventos/:id" element={<ProtectedRoute requiredRole="produtor"><EventDashboard /></ProtectedRoute>} />
                <Route path="/produtor/criar-evento" element={<ProtectedRoute requiredRole="produtor"><CriarEvento /></ProtectedRoute>} />
                <Route path="/produtor/editar-evento/:id" element={<ProtectedRoute requiredRole="produtor"><EditarEvento /></ProtectedRoute>} />
                <Route path="/produtor/financeiro" element={<ProtectedRoute requiredRole="produtor"><Financeiro /></ProtectedRoute>} />
                <Route path="/produtor/financeiro/:eventId" element={<ProtectedRoute requiredRole="produtor"><FinanceiroEvento /></ProtectedRoute>} />
                <Route path="/produtor/equipe" element={<ProtectedRoute requiredRole="produtor"><ColaboradoresManager /></ProtectedRoute>} />
                <Route path="/produtor/configuracoes" element={<ProtectedRoute requiredRole="produtor"><ProducerSettings /></ProtectedRoute>} />

                {/* Legacy redirects */}
                <Route path="/auth" element={<LegacyAuthRedirect />} />
                <Route path="/dashboard" element={<Navigate to="/produtor/dashboard" replace />} />
                <Route path="/dashboard/eventos" element={<Navigate to="/produtor/eventos" replace />} />
                <Route path="/dashboard/evento/:id" element={<Navigate to="/produtor/eventos/:id" replace />} />
                <Route path="/criar-evento" element={<Navigate to="/produtor/criar-evento" replace />} />
                <Route path="/editar-evento/:id" element={<Navigate to="/produtor/editar-evento/:id" replace />} />
                <Route path="/dashboard/financeiro" element={<Navigate to="/produtor/financeiro" replace />} />
                <Route path="/dashboard/colaboradores" element={<Navigate to="/produtor/equipe" replace />} />
                
                {/* Collaborator Routes */}
                <Route path="/colaborador" element={<ColaboradorLogin />} />
                <Route path="/colaborador/eventos" element={<ColaboradorProtectedRoute><ColaboradorEventos /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/dashboard" element={<Navigate to="/colaborador/eventos" replace />} />
                <Route path="/colaborador/evento/:id" element={<ColaboradorProtectedRoute><ColaboradorEvento /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/evento/:id/scanner" element={<Navigate to="/colaborador/evento/:id" replace />} />
                <Route path="/colaborador/evento/:id/participantes" element={<Navigate to="/colaborador/evento/:id" replace />} />
                <Route path="/colaborador/evento/:id/convidados" element={<Navigate to="/colaborador/evento/:id" replace />} />
                
                {/* Admin Routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
                <Route path="/admin/produtores" element={<AdminProtectedRoute><AdminProdutores /></AdminProtectedRoute>} />
                <Route path="/admin/produtores/:id" element={<AdminProtectedRoute><AdminProdutorDetalhe /></AdminProtectedRoute>} />
                <Route path="/admin/repasses" element={<AdminProtectedRoute><AdminRepasses /></AdminProtectedRoute>} />
                <Route path="/admin/configuracoes" element={<AdminProtectedRoute><AdminConfiguracoes /></AdminProtectedRoute>} />
                <Route path="/admin/saude" element={<AdminProtectedRoute><AdminLayout><AdminSaude /></AdminLayout></AdminProtectedRoute>} />

                {/* Public Routes */}
                <Route path="/lista/:slug" element={<GuestListPublicForm />} />
                
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ColaboradorAuthProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
