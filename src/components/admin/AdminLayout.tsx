import React from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AdminSidebar } from './AdminSidebar';
import { Separator } from '@/components/ui/separator';

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  return (
    <div className="admin-theme">
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground font-body">
          <AdminSidebar />
          <SidebarInset className="flex-1 min-w-0 bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 h-4" />
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md admin-gradient-bg flex items-center justify-center text-white font-display font-bold text-sm shadow-sm">
                  F
                </div>
                <span className="text-sm font-display font-semibold admin-gradient-text">
                  FestPag
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm font-medium text-foreground">Admin</span>
                {title && (
                  <>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-sm font-medium text-muted-foreground">{title}</span>
                  </>
                )}
              </div>
            </header>
            <main className="flex-1 p-6 overflow-auto bg-background">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
