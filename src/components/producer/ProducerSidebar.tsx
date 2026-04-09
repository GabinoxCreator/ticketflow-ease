import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Plus, 
  User, 
  Wallet,
  Users,
  ClipboardList,
  Settings
} from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';

const mainMenuItems = [
  { title: 'Visão Geral', url: '/produtor/dashboard', icon: LayoutDashboard },
  { title: 'Meus Eventos', url: '/produtor/eventos', icon: CalendarDays },
  { title: 'Criar Evento', url: '/produtor/criar-evento', icon: Plus },
];

const managementItems = [
  { title: 'Pedidos', url: '/produtor/pedidos', icon: ClipboardList },
  { title: 'Financeiro', url: '/produtor/financeiro', icon: Wallet },
  { title: 'Colaboradores', url: '/produtor/equipe', icon: Users },
];

export function ProducerSidebar() {
  const location = useLocation();
  const { profile } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const isActive = (path: string) => {
    if (path === '/produtor/dashboard') return location.pathname === '/produtor/dashboard';
    return location.pathname.startsWith(path);
  };

  const renderMenuItems = (items: typeof mainMenuItems) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
            <NavLink to={item.url}>
              <item.icon className="w-4 h-4" />
              <span>{item.title}</span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4">
        <NavLink to="/" className="flex items-center gap-2">
          <img src={logoFestpag} alt="FestPag" className={collapsed ? "h-6 w-auto" : "h-8 w-auto"} />
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderMenuItems(mainMenuItems)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Gestão</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderMenuItems(managementItems)}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/produtor/configuracoes')} tooltip="Configurações">
                  <NavLink to="/produtor/configuracoes">
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Minha Conta">
              <NavLink to="/minha-conta" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                {!collapsed && (
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {profile?.nome_completo || 'Produtor'}
                    </span>
                    <span className="text-xs text-muted-foreground">Ver perfil</span>
                  </div>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
