import { LayoutDashboard, Users, Banknote, Settings, LogOut, Activity, ClipboardCheck, Users2, Inbox } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminPermissions, type AdminSection } from '@/hooks/useAdminPermissions';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const menuItems: { title: string; url: string; icon: typeof LayoutDashboard; section: AdminSection }[] = [
  { title: 'Dashboard', url: '/admin/dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { title: 'Produtores', url: '/admin/produtores', icon: Users, section: 'produtores' },
  { title: 'Repasses', url: '/admin/repasses', icon: Banknote, section: 'repasses' },
  { title: 'Leads', url: '/admin/leads', icon: Inbox, section: 'leads' },
  { title: 'Checklist', url: '/admin/checklist', icon: ClipboardCheck, section: 'checklist' },
  { title: 'Saúde', url: '/admin/saude', icon: Activity, section: 'saude' },
  { title: 'Configurações', url: '/admin/configuracoes', icon: Settings, section: 'configuracoes' },
];

const baseItem =
  'relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground';
const activeItem =
  'admin-active-bar bg-accent text-primary pl-4';

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { hasSection, isManager } = useAdminPermissions();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const visibleItems = menuItems.filter((it) => hasSection(it.section));

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-3 py-4 h-auto">
            <div className="h-8 w-8 rounded-md admin-gradient-bg flex items-center justify-center text-white font-display font-bold shadow-sm">
              F
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="font-display font-semibold admin-gradient-text text-base">
                  FestPag
                </span>
                <span className="text-[10px] tracking-[0.18em] text-muted-foreground font-medium">
                  ADMIN
                </span>
              </div>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/admin/dashboard'}
                      className={baseItem}
                      activeClassName={activeItem}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isManager && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin/equipe"
                      className={baseItem}
                      activeClassName={activeItem}
                    >
                      <Users2 className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Equipe</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 bg-sidebar">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-accent"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
