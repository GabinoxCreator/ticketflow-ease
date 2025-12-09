import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import EventDetails from "./pages/EventDetails";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import DashboardEventos from "./pages/DashboardEventos";
import CriarEvento from "./pages/CriarEvento";
import EditarEvento from "./pages/EditarEvento";
import EventDashboard from "./pages/EventDashboard";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" theme="dark" />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/evento/:id" element={<EventDetails />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<ProtectedRoute requiredRole="produtor"><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/eventos" element={<ProtectedRoute requiredRole="produtor"><DashboardEventos /></ProtectedRoute>} />
              <Route path="/dashboard/evento/:id" element={<ProtectedRoute requiredRole="produtor"><EventDashboard /></ProtectedRoute>} />
              <Route path="/criar-evento" element={<ProtectedRoute requiredRole="produtor"><CriarEvento /></ProtectedRoute>} />
              <Route path="/editar-evento/:id" element={<ProtectedRoute requiredRole="produtor"><EditarEvento /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
