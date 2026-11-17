import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import MarketingConsentSync from "@/components/MarketingConsentSync";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ColaboradorAuthProvider } from "@/contexts/ColaboradorAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ColaboradorProtectedRoute } from "@/components/colaborador/ColaboradorProtectedRoute";
import EventDetails from "./pages/EventDetails";
import PedidoStatus from "./pages/PedidoStatus";
import AdminProtectedRoute from "./components/admin/AdminProtectedRoute";
import SectionProtectedRoute from "./components/admin/SectionProtectedRoute";
import { FundoDaPagina } from '@/components/FundoDaPagina';
import { sobDemanda, preCarregar, carregarMapaDePoltronas, carregarCheckoutDePoltronas } from "@/lib/sobDemanda";
import { ProtecaoDasRotas } from "@/components/ProtecaoDasRotas";

// Cada tela é um pedaço próprio, baixado só quando a pessoa vai para ela (OS-435).
// Ficam no pedaço inicial (import normal, acima) a página do evento, com o checkout,
// o login e o carrinho dentro dela, e a tela do pedido (/pedido/:id, para onde o Pix e
// o cartão levam): é o caminho de quem chega do anúncio e compra, e nada nele pode
// depender de um pedaço baixar depois. Tela nova no roteador entra aqui embaixo, como
// as outras. Ver src/lib/sobDemanda.ts (a recarga única quando um pedaço não baixa).
const Index = sobDemanda(() => import("./pages/Index"));
const Auth = sobDemanda(() => import("./pages/Auth"));
const NotFound = sobDemanda(() => import("./pages/NotFound"));
const Dashboard = sobDemanda(() => import("./pages/Dashboard"));
const DashboardEventos = sobDemanda(() => import("./pages/DashboardEventos"));
const CriarEvento = sobDemanda(() => import("./pages/CriarEvento"));
const EditarEvento = sobDemanda(() => import("./pages/EditarEvento"));
const EventDashboard = sobDemanda(() => import("./pages/EventDashboard"));
const CheckoutSuccess = sobDemanda(() => import("./pages/CheckoutSuccess"));
const Financeiro = sobDemanda(() => import("./pages/Financeiro"));
const FinanceiroEvento = sobDemanda(() => import("./pages/FinanceiroEvento"));
const MeusIngressos = sobDemanda(() => import("./pages/MeusIngressos"));
const TransferenciaIngresso = sobDemanda(() => import("./pages/TransferenciaIngresso"));
const CortesiaLink = sobDemanda(() => import("./pages/CortesiaLink"));
const MinhaConta = sobDemanda(() => import("./pages/MinhaConta"));
const ColaboradoresManager = sobDemanda(() => import("./pages/ColaboradoresManager"));
const ColaboradorLogin = sobDemanda(() => import("./pages/colaborador/ColaboradorLogin"));
const ColaboradorEventos = sobDemanda(() => import("./pages/colaborador/ColaboradorEventos"));
const ColaboradorEvento = sobDemanda(() => import("./pages/colaborador/ColaboradorEvento"));
const GuestListPublicForm = sobDemanda(() => import("./pages/GuestListPublicForm"));
const PoliticaPrivacidade = sobDemanda(() => import("./pages/PoliticaPrivacidade"));
const FacialPeloLink = sobDemanda(() => import("./pages/FacialPeloLink"));
const EntendaATaxa = sobDemanda(() => import("./pages/EntendaATaxa"));
const TermosDeUso = sobDemanda(() => import("./pages/TermosDeUso"));
const PoliticaReembolso = sobDemanda(() => import("./pages/PoliticaReembolso"));
const CentralDeAjuda = sobDemanda(() => import("./pages/CentralDeAjuda"));
const AreaDoProdutor = sobDemanda(() => import("./pages/AreaDoProdutor"));
const ProducerAuth = sobDemanda(() => import("./pages/ProducerAuth"));
const ProducerSettings = sobDemanda(() => import("./pages/ProducerSettings"));
const ProdutorPublicoPage = sobDemanda(() => import("./pages/ProdutorPublico"));
const SeatTypes = sobDemanda(() => import("./pages/SeatTypes"));
const ProducerProducts = sobDemanda(() => import("./pages/ProducerProducts"));
const Locais = sobDemanda(() => import("./pages/Locais"));
const LocaisMapas = sobDemanda(() => import("./pages/LocaisMapas"));
const MapEditorPage = sobDemanda(() => import("./pages/producer/MapEditorPage"));
const AdminLogin = sobDemanda(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = sobDemanda(() => import("./pages/admin/AdminDashboard"));
const AdminProdutores = sobDemanda(() => import("./pages/admin/AdminProdutores"));
const AdminProdutorDetalhe = sobDemanda(() => import("./pages/admin/AdminProdutorDetalhe"));
const AdminAberturas = sobDemanda(() => import("./pages/admin/AdminAberturas"));
const AdminAberturaDetalhe = sobDemanda(() => import("./pages/admin/AdminAberturaDetalhe"));
const AbrirEvento = sobDemanda(() => import("./pages/AbrirEvento"));
const AdminEventoDetalhe = sobDemanda(() => import("./pages/admin/AdminEventoDetalhe"));
const AdminRepasses = sobDemanda(() => import("./pages/admin/AdminRepasses"));
const AdminReembolsos = sobDemanda(() => import("./pages/admin/AdminReembolsos"));
const AdminConfiguracoes = sobDemanda(() => import("./pages/admin/AdminConfiguracoes"));
const AdminSaude = sobDemanda(() => import("./pages/admin/AdminSaude"));
const AdminChecklist = sobDemanda(() => import("./pages/admin/AdminChecklist"));
const AdminEquipe = sobDemanda(() => import("./pages/admin/AdminEquipe"));
const AdminLeads = sobDemanda(() => import("./pages/admin/AdminLeads"));
// Telas de poltrona: o mapa e o checkout de poltronas (ver src/lib/sobDemanda.ts). A
// página do evento com poltrona já baixa o mapa (EventDetails.tsx); aqui, na tela do
// mapa, o checkout de poltronas começa a baixar (medido no 4G lento: sem isso, o
// "Reservar" esperava o arquivo baixar). Quem não escolhe poltrona não baixa nada a mais.
const EventMapPage = sobDemanda(carregarMapaDePoltronas);
const SeatCheckout = sobDemanda(carregarCheckoutDePoltronas);
function PreCargaDoCheckoutDePoltronas() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/evento/") && pathname.endsWith("/mapa")) preCarregar(carregarCheckoutDePoltronas);
  }, [pathname]);
  return null;
}
const AdminLayout = sobDemanda(() =>
  import("./components/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })),
);
const LandingLp = sobDemanda(() => import("./pages/LandingLp"));
const LandingLp2 = sobDemanda(() => import("./pages/LandingLp2"));

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
        {/* O fundo da página inteira, atrás de tudo. Um só — ver o comentário
          * em FundoDaPagina.tsx. (24/09/2026) */}
        <FundoDaPagina />
        <Toaster />
        {/* `theme="light"` desde a virada de 24/09: com "dark" o aviso saía
          * preto no meio de um site claro. */}
        <Sonner position="top-center" theme="light" />
        <BrowserRouter>
          <AuthProvider>
            <ColaboradorAuthProvider>
              {/* `relative z-10`: põe o app ACIMA do <FundoDaPagina />, que é
                * `fixed z-0`. Ver o comentário lá — sem isto, ou o fundo cobre a
                * página, ou ele some atrás dela. */}
              <div className="relative z-10">
              {/* Enquanto o pedaço da tela baixa, nada aparece no lugar dela (o fundo da
                * página continua). Só acontece na 1ª ida a cada tela (OS-435). Se a tela
                * não baixa nem depois da recarga única, a proteção mostra no lugar dela o
                * aviso aprovado ("Tentar de novo"), sem derrubar o resto do site. */}
              <ProtecaoDasRotas>
              <Suspense fallback={null}>
              <Routes>
                {/* Public */}
                <Route path="/" element={<Index />} />
                <Route path="/lp" element={<LandingLp />} />
                <Route path="/lp2" element={<LandingLp2 />} />
                <Route path="/evento/:id/mapa" element={<EventMapPage />} />
                <Route path="/evento/:id" element={<EventDetails />} />
                <Route path="/checkout" element={<Navigate to="/" replace />} />
                {/* Mantido temporariamente para back_url legacy do Mercado Pago.
                    Auditar logs e remover após confirmar 0 hits recentes. */}
                <Route path="/checkout/sucesso" element={<CheckoutSuccess />} />
                <Route path="/login" element={<Auth />} />
                {/* Código de uso único (QR na tela do computador ou link no WhatsApp) para
                    tirar a foto do rosto pelo celular (OS-343). Só é gerado com a chave da
                    facial obrigatória ligada (`src/lib/facialObrigatoria.ts`). */}
                <Route path="/facial/:token" element={<FacialPeloLink />} />
                <Route path="/reset-password" element={<Navigate to="/login?mode=forgot" replace />} />
                <Route path="/privacidade" element={<PoliticaPrivacidade />} />
                <Route path="/taxa" element={<EntendaATaxa />} />
          <Route path="/termos" element={<TermosDeUso />} />
                <Route path="/reembolso" element={<PoliticaReembolso />} />
                <Route path="/ajuda" element={<CentralDeAjuda />} />

                {/* Client Protected */}
                {/* Link de transferência de ingresso: PÚBLICA de propósito — quem recebe
                    ainda não tem conta, e é esta tela que pede para ela criar. */}
                <Route path="/transferencia/:token" element={<TransferenciaIngresso />} />
                {/* Link de cortesia do evento (OS-313): PÚBLICA de propósito, o convidado
                    chega sem conta, e é esta tela que cria a conta, cadastra o rosto e
                    entrega o ingresso. Liga-se num evento ligando `retirada_publica` num
                    lote de preço zero (só a casa liga; o gatilho do banco recusa o resto). */}
                <Route path="/cortesia/:slug" element={<CortesiaLink />} />
                {/* Link de abertura de evento (OS-221): PÚBLICA de propósito, o produtor
                    ainda não tem conta; a última etapa pede para criar. */}
                <Route path="/abrir-evento/:token" element={<AbrirEvento />} />
                <Route path="/meus-ingressos" element={<ProtectedRoute><MeusIngressos /></ProtectedRoute>} />
                <Route path="/meus-ingressos" element={<ProtectedRoute><MeusIngressos /></ProtectedRoute>} />
                <Route path="/minha-conta" element={<ProtectedRoute><MinhaConta /></ProtectedRoute>} />
                {/* Acompanhamento do pedido: tela com endereço próprio, sobrevive a
                    voltar do app do banco. Ver src/pages/PedidoStatus.tsx. */}
                <Route path="/pedido/:orderId" element={<ProtectedRoute><PedidoStatus /></ProtectedRoute>} />
                <Route path="/checkout/mesa/:eventId" element={<ProtectedRoute><SeatCheckout /></ProtectedRoute>} />

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
                <Route path="/produtor/tipos-de-assento" element={<ProtectedRoute requiredRole="produtor"><SeatTypes /></ProtectedRoute>} />
                <Route path="/produtor/produtos" element={<ProtectedRoute requiredRole="produtor"><ProducerProducts /></ProtectedRoute>} />
                <Route path="/produtor/locais" element={<ProtectedRoute requiredRole="produtor"><Locais /></ProtectedRoute>} />
                <Route path="/produtor/locais/:venueId/mapas" element={<ProtectedRoute requiredRole="produtor"><LocaisMapas /></ProtectedRoute>} />
                <Route path="/produtor/locais/:venueId/mapas/:mapId/editor" element={<ProtectedRoute requiredRole="produtor"><MapEditorPage /></ProtectedRoute>} />
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
                <Route path="/admin/dashboard" element={<AdminProtectedRoute><SectionProtectedRoute section="dashboard"><AdminDashboard /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/produtores" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminProdutores /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/produtores/:id" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminProdutorDetalhe /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/aberturas" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminAberturas /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/aberturas/:id" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminAberturaDetalhe /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/eventos/:eventId" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminEventoDetalhe /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/repasses" element={<AdminProtectedRoute><SectionProtectedRoute section="repasses"><AdminRepasses /></SectionProtectedRoute></AdminProtectedRoute>} />
                {/* Reembolsos moram na mesma seção dos repasses: é quem cuida do dinheiro que entra e sai. */}
                <Route path="/admin/reembolsos" element={<AdminProtectedRoute><SectionProtectedRoute section="repasses"><AdminReembolsos /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/configuracoes" element={<AdminProtectedRoute><SectionProtectedRoute section="configuracoes"><AdminConfiguracoes /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/saude" element={<AdminProtectedRoute><SectionProtectedRoute section="saude"><AdminLayout><AdminSaude /></AdminLayout></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/checklist" element={<AdminProtectedRoute><SectionProtectedRoute section="checklist"><AdminChecklist /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/equipe" element={<AdminProtectedRoute><SectionProtectedRoute section="_manage_team"><AdminEquipe /></SectionProtectedRoute></AdminProtectedRoute>} />
                <Route path="/admin/leads" element={<AdminProtectedRoute><SectionProtectedRoute section="leads"><AdminLeads /></SectionProtectedRoute></AdminProtectedRoute>} />

                {/* Public Routes */}
                <Route path="/lista/:slug" element={<GuestListPublicForm />} />
                
                
                {/* Página própria do produtor (OS-219): festpag.digital/<endereço>. Fica por
                  * último: toda rota acima ganha dela. Endereço sem dono cai no 404. */}
                <Route path="/:slugProdutor" element={<ProdutorPublicoPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              </ProtecaoDasRotas>
              </div>
              <PreCargaDoCheckoutDePoltronas />
              <CookieConsentBanner />
              <MarketingConsentSync />
            </ColaboradorAuthProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
