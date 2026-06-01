import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react';

type AdminSection =
  | 'dashboard'
  | 'produtores'
  | 'repasses'
  | 'checklist'
  | 'saude'
  | 'configuracoes'
  | '_manage_team';

const SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: 'Dashboard',
  produtores: 'Produtores',
  repasses: 'Repasses',
  checklist: 'Checklist',
  saude: 'Saúde',
  configuracoes: 'Configurações',
  _manage_team: 'Gerenciar equipe',
};

const ALL_SECTIONS: AdminSection[] = [
  'dashboard',
  'produtores',
  'repasses',
  'checklist',
  'saude',
  'configuracoes',
  '_manage_team',
];

interface AdminRow {
  user_id: string;
  email: string | null;
  nome_completo: string | null;
  sections: Set<string>;
}

export default function AdminEquipe() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteSections, setInviteSections] = useState<Set<AdminSection>>(new Set(['dashboard']));
  const [inviteBusy, setInviteBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-team-list'],
    queryFn: async (): Promise<AdminRow[]> => {
      const { data: roles, error: re } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      if (re) throw re;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];

      const [{ data: profiles }, { data: perms }] = await Promise.all([
        supabase.from('profiles').select('id, nome_completo, email').in('id', ids),
        supabase.from('admin_section_permissions').select('user_id, section').in('user_id', ids),
      ]);

      const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const permMap = new Map<string, Set<string>>();
      for (const p of perms ?? []) {
        const s = permMap.get(p.user_id) ?? new Set<string>();
        s.add(p.section);
        permMap.set(p.user_id, s);
      }

      return ids.map((id) => ({
        user_id: id,
        email: profMap.get(id)?.email ?? null,
        nome_completo: profMap.get(id)?.nome_completo ?? null,
        sections: permMap.get(id) ?? new Set<string>(),
      }));
    },
  });

  const managerCount = rows.filter((r) => r.sections.has('_manage_team')).length;

  const togglePermission = async (row: AdminRow, section: AdminSection, on: boolean) => {
    if (on) {
      const { error } = await supabase
        .from('admin_section_permissions')
        .insert({ user_id: row.user_id, section });
      if (error) {
        toast.error('Falha ao conceder permissão: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('admin_section_permissions')
        .delete()
        .eq('user_id', row.user_id)
        .eq('section', section);
      if (error) {
        const msg = error.message || '';
        if (msg.includes('cannot_remove_own_manage_team')) {
          toast.error('Você não pode remover seu próprio acesso de gestor.');
        } else if (msg.includes('cannot_remove_last_manage_team')) {
          toast.error(
            'Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes.',
          );
        } else {
          toast.error('Falha ao remover permissão: ' + msg);
        }
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['admin-team-list'] });
    queryClient.invalidateQueries({ queryKey: ['admin-section-permissions'] });
    toast.success(on ? 'Permissão concedida' : 'Permissão removida');
  };

  const submitInvite = async () => {
    if (!inviteEmail || !inviteName) {
      toast.error('Preencha email e nome.');
      return;
    }
    setInviteBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-invite-collaborator', {
      body: {
        email: inviteEmail.trim(),
        nome_completo: inviteName.trim(),
        sections: Array.from(inviteSections),
      },
    });
    setInviteBusy(false);
    if (error || data?.error) {
      const err = data?.error || error?.message || 'erro';
      if (err === 'already_admin') {
        toast.error('Esse email já é admin.');
      } else {
        toast.error('Falha ao convidar: ' + err);
      }
      return;
    }
    toast.success(
      data?.promoted_existing
        ? 'Usuário existente promovido a admin.'
        : 'Convite enviado. O colaborador receberá um email para definir senha.',
    );
    setInviteOpen(false);
    setInviteEmail('');
    setInviteName('');
    setInviteSections(new Set(['dashboard']));
    queryClient.invalidateQueries({ queryKey: ['admin-team-list'] });
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const { data, error } = await supabase.functions.invoke('admin-deactivate-collaborator', {
      body: { target_user_id: deactivateTarget.user_id },
    });
    if (error || data?.error) {
      const err = data?.error || error?.message;
      if (err === 'cannot_remove_last_manage_team') {
        toast.error(
          'Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes.',
        );
      } else {
        toast.error('Falha ao desativar: ' + err);
      }
      return;
    }
    toast.success('Colaborador desativado.');
    setDeactivateTarget(null);
    queryClient.invalidateQueries({ queryKey: ['admin-team-list'] });
  };

  return (
    <AdminLayout title="Equipe FestPag">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Colaboradores admin</h2>
            <p className="text-sm text-muted-foreground">
              Conceda acesso por seção. Quem tem "Gerenciar equipe" vê tudo e administra a equipe.
            </p>
          </div>
          <Button onClick={() => setInviteOpen(true)} className="bg-orange-500 hover:bg-orange-600">
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar colaborador
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const isSelf = row.user_id === user?.id;
              const isLastManager =
                row.sections.has('_manage_team') && managerCount <= 1;
              return (
                <Card key={row.user_id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {row.nome_completo || '(sem nome)'}
                        {isSelf && (
                          <Badge variant="outline" className="text-xs">
                            você
                          </Badge>
                        )}
                        {row.sections.has('_manage_team') && (
                          <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Gestor
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground break-words">
                        {row.email || '—'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeactivateTarget(row)}
                      disabled={isSelf}
                      title={isSelf ? 'Você não pode desativar a si mesmo' : ''}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Desativar
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {ALL_SECTIONS.map((s) => {
                      const checked = row.sections.has(s);
                      const isOwnManageTeam = isSelf && s === '_manage_team';
                      const isLastManagerToggle =
                        s === '_manage_team' && checked && isLastManager && !isSelf;
                      const disabled = isOwnManageTeam;
                      const tooltip = isOwnManageTeam
                        ? 'Você não pode remover seu próprio acesso de gestor'
                        : isLastManagerToggle
                          ? 'Último gestor — promova outro antes de remover'
                          : '';
                      return (
                        <label
                          key={s}
                          title={tooltip}
                          className={`flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 ${
                            disabled ? 'opacity-50' : ''
                          }`}
                        >
                          <span className="text-sm text-foreground">{SECTION_LABELS[s]}</span>
                          <Switch
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) => togglePermission(row, s, v)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar colaborador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inv-name">Nome completo</Label>
              <Input
                id="inv-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <Label>Seções liberadas</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ALL_SECTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={inviteSections.has(s)}
                      onCheckedChange={(v) => {
                        const next = new Set(inviteSections);
                        if (v) next.add(s);
                        else next.delete(s);
                        setInviteSections(next);
                      }}
                    />
                    {SECTION_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitInvite}
              disabled={inviteBusy}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {inviteBusy ? 'Enviando…' : 'Enviar convite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.nome_completo || deactivateTarget?.email} perderá acesso ao painel
              admin. A conta no sistema de autenticação não será excluída — só o papel de admin e as
              permissões serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-destructive hover:bg-destructive/90"
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
