import { LayoutDashboard, Users, Banknote, Settings, LogOut, Shield, Activity, ClipboardCheck, Users2, Inbox } from 'lucide-react';
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
  { title: 'Checklist', url: '/admin/checklist', icon: ClipboardCheck, section: 'checklist' },
  { title: 'Saúde', url: '/admin/saude', icon: Activity, section: 'saude' },
  { title: 'Configurações', url: '/admin/configuracoes', icon: Settings, section: 'configuracoes' },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { hasSection, isManager } = useAdminPermissions();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const visibleItems = menuItems.filter((it) => hasSection(it.section));

  return (
    <Sidebar collapsible="icon" className="border-r border-orange-500/20">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-3 py-4">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-orange-500" />
                <span className="text-orange-500 font-bold text-sm">ADMIN</span>
              </div>
            )}
            {collapsed && <Shield className="h-5 w-5 text-orange-500" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/admin/dashboard'}
                      className="hover:bg-orange-500/10"
                      activeClassName="bg-orange-500/20 text-orange-400 font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
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
                      className="hover:bg-orange-500/10"
                      activeClassName="bg-orange-500/20 text-orange-400 font-medium"
                    >
                      <Users2 className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Equipe</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
