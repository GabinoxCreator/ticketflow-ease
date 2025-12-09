import React from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { ProducerSidebar } from './ProducerSidebar';
import { Separator } from '@/components/ui/separator';
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from '@/components/ui/breadcrumb';
import { useLocation } from 'react-router-dom';

interface ProducerLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

const routeTitles: Record<string, string> = {
  '/dashboard': 'Visão Geral',
  '/dashboard/eventos': 'Meus Eventos',
  '/criar-evento': 'Criar Evento',
  '/dashboard/relatorios': 'Relatórios',
  '/dashboard/conta': 'Minha Conta',
};

export function ProducerLayout({ children, title, breadcrumbs }: ProducerLayoutProps) {
  const location = useLocation();
  
  const pageTitle = title || routeTitles[location.pathname] || 'Dashboard';

  const defaultBreadcrumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: pageTitle },
  ];

  const displayBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ProducerSidebar />
        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/50 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {displayBreadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbItem>
                      {crumb.href ? (
                        <BreadcrumbLink href={crumb.href}>
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < displayBreadcrumbs.length - 1 && (
                      <BreadcrumbSeparator />
                    )}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
