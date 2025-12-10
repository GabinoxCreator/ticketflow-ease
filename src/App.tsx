import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import Financeiro from "./pages/Financeiro";
import MeusIngressos from "./pages/MeusIngressos";
import MinhaConta from "./pages/MinhaConta";
import ColaboradoresManager from "./pages/ColaboradoresManager";
import ColaboradorLogin from "./pages/colaborador/ColaboradorLogin";
import ColaboradorDashboard from "./pages/colaborador/ColaboradorDashboard";
import ColaboradorEventoMenu from "./pages/colaborador/ColaboradorEventoMenu";
import QRCodeScanner from "./pages/colaborador/QRCodeScanner";
import ColaboradorParticipantes from "./pages/colaborador/ColaboradorParticipantes";
import ColaboradorConvidados from "./pages/colaborador/ColaboradorConvidados";
import GuestListPublicForm from "./pages/GuestListPublicForm";
import TestePagamento from "./pages/TestePagamento";

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
                <Route path="/" element={<Index />} />
                <Route path="/evento/:id" element={<EventDetails />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/checkout/sucesso" element={<CheckoutSuccess />} />
                <Route path="/meus-ingressos" element={<ProtectedRoute><MeusIngressos /></ProtectedRoute>} />
                <Route path="/minha-conta" element={<ProtectedRoute><MinhaConta /></ProtectedRoute>} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<ProtectedRoute requiredRole="produtor"><Dashboard /></ProtectedRoute>} />
                <Route path="/dashboard/eventos" element={<ProtectedRoute requiredRole="produtor"><DashboardEventos /></ProtectedRoute>} />
                <Route path="/dashboard/evento/:id" element={<ProtectedRoute requiredRole="produtor"><EventDashboard /></ProtectedRoute>} />
                <Route path="/criar-evento" element={<ProtectedRoute requiredRole="produtor"><CriarEvento /></ProtectedRoute>} />
                <Route path="/editar-evento/:id" element={<ProtectedRoute requiredRole="produtor"><EditarEvento /></ProtectedRoute>} />
                <Route path="/dashboard/financeiro" element={<ProtectedRoute requiredRole="produtor"><Financeiro /></ProtectedRoute>} />
                <Route path="/dashboard/colaboradores" element={<ProtectedRoute requiredRole="produtor"><ColaboradoresManager /></ProtectedRoute>} />
                
                {/* Collaborator Routes */}
                <Route path="/colaborador" element={<ColaboradorLogin />} />
                <Route path="/colaborador/dashboard" element={<ColaboradorProtectedRoute><ColaboradorDashboard /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/evento/:id" element={<ColaboradorProtectedRoute><ColaboradorEventoMenu /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/evento/:id/scanner" element={<ColaboradorProtectedRoute><QRCodeScanner /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/evento/:id/participantes" element={<ColaboradorProtectedRoute><ColaboradorParticipantes /></ColaboradorProtectedRoute>} />
                <Route path="/colaborador/evento/:id/convidados" element={<ColaboradorProtectedRoute><ColaboradorConvidados /></ColaboradorProtectedRoute>} />
                
                {/* Public Routes */}
                <Route path="/lista/:slug" element={<GuestListPublicForm />} />
                <Route path="/teste-pagamento" element={<TestePagamento />} />
                
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
