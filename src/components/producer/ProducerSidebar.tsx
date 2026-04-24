import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Plus,
  User,
  Wallet,
  Users,
  ClipboardList,
  Settings,
  LogOut,
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

const settingsItems = [
  { title: 'Configurações', url: '/produtor/configuracoes', icon: Settings },
];

export function ProducerSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const isActive = (path: string) => {
    if (path === '/produtor/dashboard') return location.pathname === '/produtor/dashboard';
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const renderMenuItems = (items: typeof mainMenuItems) => (
    <SidebarMenu className="gap-1">
      {items.map((item) => {
        const active = isActive(item.url);
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.title}
              className={cn(
                'h-11 px-2 rounded-lg transition-all duration-200 relative overflow-hidden',
                'hover:bg-muted/60',
                'data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/15 data-[active=true]:to-accent/10',
                'data-[active=true]:text-primary data-[active=true]:font-medium',
                'data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-2 data-[active=true]:before:bottom-2',
                'data-[active=true]:before:w-1 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-gradient-to-b data-[active=true]:before:from-primary data-[active=true]:before:to-accent',
              )}
            >
              <NavLink to={item.url} className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-all duration-200',
                    active
                      ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md'
                      : 'bg-muted/50 text-muted-foreground group-hover/menu-button:text-foreground group-hover/menu-button:scale-105',
                  )}
                >
                  <item.icon className="w-4 h-4" />
                </div>
                {!collapsed && <span className="text-sm">{item.title}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="border-b border-border/40 py-5">
        <NavLink
          to="/"
          className={cn(
            'flex items-center justify-center w-full',
            collapsed ? 'h-9' : 'h-14',
          )}
        >
          <img
            src={logoFestpag}
            alt="FestPag"
            className={cn(
              'w-auto object-contain transition-all duration-200',
              collapsed
                ? 'h-8'
                : 'h-12 drop-shadow-[0_0_8px_hsl(var(--primary)/0.15)]',
            )}
          />
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-2 mb-1">
              Menu Principal
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderMenuItems(mainMenuItems)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-2 mb-1">
              Gestão
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderMenuItems(managementItems)}</SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-2 mb-1">
              Configurações
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderMenuItems(settingsItems)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 gap-2 border-t border-border/40">
        {/* Profile Card */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Minha Conta"
              className={cn(
                'h-auto rounded-xl transition-all duration-200',
                'bg-gradient-to-br from-primary/10 via-transparent to-accent/5',
                'hover:from-primary/15 hover:to-accent/10',
                'border border-border/40',
                collapsed ? 'p-2' : 'p-3',
              )}
            >
              <NavLink to="/minha-conta" className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent opacity-80 blur-[1px]" />
                  <div
                    className={cn(
                      'relative rounded-full bg-card flex items-center justify-center overflow-hidden',
                      collapsed ? 'w-8 h-8' : 'w-10 h-10',
                      'ring-1 ring-border/60',
                    )}
                  >
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.nome_completo || 'Perfil'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {!collapsed && (
                  <div className="flex flex-col text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">
                        {profile?.nome_completo?.split(' ')[0] || 'Produtor'}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[9px] font-medium border-primary/30 text-primary bg-primary/5 shrink-0"
                      >
                        Produtor
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {profile?.email || 'Ver perfil'}
                    </span>
                  </div>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Sign Out Button */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair da conta"
              onClick={handleSignOut}
              className={cn(
                'h-11 rounded-lg transition-all duration-200',
                'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive',
                'flex items-center gap-3',
                collapsed ? 'justify-center px-2' : 'px-2',
              )}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/15 shrink-0">
                <LogOut className="w-4 h-4" />
              </div>
              {!collapsed && (
                <span className="text-sm font-medium">Sair da conta</span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
