import React from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { ProducerSidebar } from './ProducerSidebar';
import { PinObrigatorioAviso } from './PinObrigatorioAviso';
import { Separator } from '@/components/ui/separator';
import { 
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator 
} from '@/components/ui/breadcrumb';
import { useLocation } from 'react-router-dom';

interface ProducerLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

// O nome de cada página na trilha é o MESMO do menu (OS-408): antes a trilha dizia
// "Equipe" para o que o menu chama de "Colaboradores", e as páginas fora desta
// lista apareciam como "Dashboard > Dashboard".
const routeTitles: Record<string, string> = {
  '/produtor/eventos': 'Meus Eventos',
  '/produtor/criar-evento': 'Criar Evento',
  '/produtor/financeiro': 'Financeiro',
  '/produtor/equipe': 'Colaboradores',
  '/produtor/locais': 'Locais',
  '/produtor/tipos-de-assento': 'Tipos de Assento',
  '/produtor/produtos': 'Produtos',
  '/produtor/configuracoes': 'Configurações',
};

/**
 * A raiz da trilha de todo o painel: o mesmo nome do menu e do título da página
 * ("Visão Geral", decisão do Gabriel em 09/11/2026; antes a trilha dizia "Dashboard").
 */
export const INICIO_DO_PAINEL = { label: 'Visão Geral', href: '/produtor/dashboard' };

export function ProducerLayout({ children, title, breadcrumbs }: ProducerLayoutProps) {
  const location = useLocation();
  const pageTitle = title || routeTitles[location.pathname];
  // Na própria página inicial (ou em página sem nome conhecido) a trilha é só "Visão Geral".
  const defaultBreadcrumbs: { label: string; href?: string }[] = pageTitle
    ? [INICIO_DO_PAINEL, { label: pageTitle }]
    : [{ label: INICIO_DO_PAINEL.label }];
  const displayBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ProducerSidebar />
        <SidebarInset className="flex-1 min-w-0">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/50 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {displayBreadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbItem>
                      {crumb.href ? (
                        <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < displayBreadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
          {/* OS-166: dono da produtora sem PIN vê o aviso a cada entrada no painel. */}
          <PinObrigatorioAviso />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
