import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, MailWarning, Phone, Lock, Save, Loader2, Shield, Sparkles, CreditCard, Trash2 } from 'lucide-react';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import { toast } from 'sonner';

import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CanaisDeContato } from '@/components/conta/CanaisDeContato';
import { TEXTOS_CONTA } from '@/components/conta/textos';
import { ehEmailInterno } from '@/lib/authV2';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const profileSchema = z.object({
  nome_completo: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  whatsapp: z.string().min(10, 'WhatsApp inválido').max(20, 'WhatsApp inválido'),
  email: z.string().email('Email inválido'),
  cpf: z.string().refine((v) => {
    const d = unformatCPF(v || '');
    return d.length === 0 || validateCPF(d);
  }, 'CPF inválido'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// Recado que vai para o cliente do jeito que está escrito, sem o prefixo
// "Erro ao atualizar perfil:" (OS-322).
class RecadoParaCliente extends Error {}

const MinhaConta = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Cada clique no aviso de e-mail abre a confirmação por código, que mora na
  // seção "Como falamos com você" (OS-303).
  const [abrirConfirmacao, setAbrirConfirmacao] = useState(0);

  // OS-303: sem nenhum contato confirmado por código, o pedido feito sem conta
  // (maquininha, venda do produtor, cortesia) não entra sozinho nesta conta
  // (claim_my_orphan_orders, OS-267). O aviso no topo leva a pessoa a confirmar.
  const contatos = (profile ?? {}) as {
    email?: string | null;
    email_confirmado_em?: string | null;
    whatsapp_confirmado_em?: string | null;
  };
  const semContatoConfirmado = !!profile && !contatos.email_confirmado_em && !contatos.whatsapp_confirmado_em;
  const temEmailDeVerdade = !!contatos.email && !ehEmailInterno(contatos.email);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-account', { body: {} });
      const resposta = data as { ok?: boolean; motivo?: string; message?: string } | null;
      // Reembolso em andamento segura a exclusão: nada foi apagado, e a pessoa
      // precisa saber o porquê e o que fazer (OS-113).
      if (!error && resposta?.motivo === 'reembolso_em_andamento' && resposta.message) {
        toast.error(resposta.message, { duration: 10000 });
        setShowDeleteDialog(false);
        setDeleting(false);
        return;
      }
      if (error || !resposta?.ok) throw error ?? new Error('falha');
      toast.success('Conta excluída. Seus dados pessoais foram removidos.');
      await signOut();
      navigate('/');
    } catch {
      toast.error('Não foi possível excluir a conta. Tente novamente ou fale com o suporte.');
      setDeleting(false);
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nome_completo: profile?.nome_completo || '',
      whatsapp: profile?.whatsapp || '',
      email: profile?.email || '',
      cpf: profile?.cpf ? formatCPF(profile.cpf) : '',
    },
  });

  const cpfValue = watch('cpf');

  // Sync form when profile loads/changes
  React.useEffect(() => {
    if (profile) {
      reset({
        nome_completo: profile.nome_completo || '',
        whatsapp: profile.whatsapp || '',
        email: profile.email || '',
        cpf: profile.cpf ? formatCPF(profile.cpf) : '',
      });
    }
  }, [profile, reset]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;

    setIsUpdating(true);
    try {
      const cpfDigits = unformatCPF(data.cpf || '');
      const cpfJaSalvo = !!profile?.cpf && validateCPF(profile.cpf);

      // Nome e WhatsApp vão direto na tabela. O CPF não vai mais junto (OS-267):
      // o navegador perdeu a escrita do CPF, e o primeiro CPF da conta passa
      // pela função `definir_meu_cpf`, que só grava em perfil ainda sem CPF.
      const { error } = await supabase
        .from('profiles')
        .update({ nome_completo: data.nome_completo, whatsapp: data.whatsapp })
        .eq('id', user.id);

      if (error) throw error;

      if (!cpfJaSalvo && cpfDigits.length === 11) {
        // A função ainda não está nos tipos gerados (types.ts é do Lovable).
        const rpcSemTipo = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: { ok?: boolean; erro?: string } | null; error: { message?: string } | null }>;
        const { data: r, error: cpfErr } = await rpcSemTipo.call(supabase, 'definir_meu_cpf', { _cpf: cpfDigits });
        if (cpfErr) throw cpfErr;
        if (!r?.ok) {
          if (r?.erro === 'cpf_ja_salvo') throw new Error('O CPF já está salvo. Entre em contato com o suporte se houver erro.');
          if (r?.erro === 'cpf_invalido') throw new Error('CPF inválido');
          // OS-302: o CPF já é de outra conta, ou tentativas demais seguidas.
          if (r?.erro === 'cpf_de_outra_conta') throw new RecadoParaCliente(TEXTOS_CONTA.cpfDeOutraConta);
          if (r?.erro === 'muitas_tentativas') throw new RecadoParaCliente(TEXTOS_CONTA.cpfMuitasTentativas);
          throw new Error(r?.erro || 'falha ao salvar o CPF');
        }
      }

      await refreshProfile();
      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      if (error instanceof RecadoParaCliente) toast.error(error.message, { duration: 12000 });
      else toast.error(`Erro ao atualizar perfil: ${error.message}`);
      // O nome pode ter gravado antes de o CPF falhar: recarrega o perfil para a
      // tela (e o topo) mostrarem o que ficou no banco.
      try { await refreshProfile(); } catch { /* o aviso de erro já saiu */ }
    } finally {
      setIsUpdating(false);
    }
  };


  return (
    <>
      <Helmet>
        <title>Minha Conta | FestPag</title>
        <meta name="description" content="Gerencie seu perfil e configurações de conta." />
      </Helmet>

      <Header />

      <main className="min-h-screen pt-24 pb-16 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 max-w-5xl relative">
          {/* Hero Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="relative overflow-hidden border-border/50 bg-gradient-to-br from-primary/15 via-card to-accent/10 backdrop-blur-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.2),transparent_50%)]" />
              <CardContent className="relative p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-full blur-md opacity-60" />
                    <Avatar className="relative w-24 h-24 border-2 border-background ring-2 ring-primary/40">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-2xl font-display font-bold">
                        {profile?.nome_completo ? getInitials(profile.nome_completo) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-primary uppercase tracking-wider">
                        Minha Conta
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2 break-words">
                      {profile?.nome_completo || 'Usuário'}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="break-all">{profile?.email}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="gradient" className="gap-1">
                        <Shield className="w-3 h-3" />
                        Cliente
                      </Badge>
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        Conta Ativa
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* OS-303: conta sem nenhum contato confirmado vê o aviso para confirmar o e-mail */}
          {semContatoConfirmado && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-6"
            >
              <Card className="border-amber-500/40 bg-amber-500/10 backdrop-blur-xl" data-aviso="confirmar-email">
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <MailWarning className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {temEmailDeVerdade ? TEXTOS_CONTA.avisoTitulo : TEXTOS_CONTA.avisoTituloSemEmail}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                        {temEmailDeVerdade ? TEXTOS_CONTA.avisoComEmail : TEXTOS_CONTA.avisoSemEmail}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="hero"
                    className="w-full sm:w-auto shrink-0"
                    onClick={() => setAbrirConfirmacao((n) => n + 1)}
                  >
                    {temEmailDeVerdade ? TEXTOS_CONTA.avisoBotaoConfirmar : TEXTOS_CONTA.avisoBotaoAdicionar}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profile Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="h-full border-border/50 bg-card/60 backdrop-blur-xl hover:border-primary/30 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/20">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Informações Pessoais</CardTitle>
                      <CardDescription className="text-xs">
                        Atualize seus dados de perfil
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    {/* Nome Completo */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="nome_completo"
                        className="text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        Nome Completo
                      </Label>
                      <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="nome_completo"
                          {...register('nome_completo')}
                          className="pl-10 bg-secondary/30 border-border/50 focus-visible:border-primary/50 focus-visible:bg-secondary/50 transition-all"
                          placeholder="Seu nome completo"
                        />
                      </div>
                      {errors.nome_completo && (
                        <p className="text-sm text-destructive">{errors.nome_completo.message}</p>
                      )}
                    </div>

                    {/* Email (read-only) */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="email"
                        className="text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        Email
                      </Label>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          {...register('email')}
                          className="pl-10 bg-muted/30 border-border/30 cursor-not-allowed"
                          disabled
                        />
                      </div>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed">
                        Para trocar ou adicionar um e-mail, use a seção "Como falamos com você", logo abaixo.
                      </p>
                    </div>

                    {/* CPF — editable only when not yet set */}
                    {(() => {
                      const cpfLocked = !!profile?.cpf && validateCPF(profile.cpf);
                      return (
                        <div className="space-y-2">
                          <Label
                            htmlFor="cpf"
                            className="text-xs uppercase tracking-wider text-muted-foreground"
                          >
                            CPF
                          </Label>
                          <div className="relative group">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <Input
                              id="cpf"
                              inputMode="numeric"
                              maxLength={14}
                              placeholder="000.000.000-00"
                              {...register('cpf')}
                              value={cpfValue || ''}
                              onChange={(e) => setValue('cpf', formatCPF(e.target.value), { shouldDirty: true, shouldValidate: true })}
                              className={cn(
                                'pl-10 transition-all',
                                cpfLocked
                                  ? 'bg-muted/30 border-border/30 cursor-not-allowed'
                                  : 'bg-secondary/30 border-border/50 focus-visible:border-primary/50 focus-visible:bg-secondary/50'
                              )}
                              disabled={cpfLocked}
                            />
                          </div>
                          {errors.cpf && (
                            <p className="text-sm text-destructive">{errors.cpf.message}</p>
                          )}
                          <p className="text-xs text-muted-foreground/80 leading-relaxed">
                            {cpfLocked
                              ? 'O CPF já está salvo. Entre em contato com o suporte se houver erro.'
                              : 'Informe seu CPF para agilizar suas próximas compras.'}
                          </p>
                        </div>
                      );
                    })()}

                    {/* WhatsApp */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="whatsapp"
                        className="text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        WhatsApp
                      </Label>
                      <div className="relative group">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="whatsapp"
                          {...register('whatsapp')}
                          className="pl-10 bg-secondary/30 border-border/50 focus-visible:border-primary/50 focus-visible:bg-secondary/50 transition-all"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      {errors.whatsapp && (
                        <p className="text-sm text-destructive">{errors.whatsapp.message}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant="gradient"
                      className="w-full"
                      disabled={isUpdating || !isDirty}
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Salvar Alterações
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>

            {/* Canais: WhatsApp e e-mail com código (plano de 09/09/2026) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="lg:col-span-2"
            >
              <CanaisDeContato abrirConfirmacao={abrirConfirmacao} />
            </motion.div>

            {/* Security Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="h-full border-border/50 bg-card/60 backdrop-blur-xl hover:border-primary/30 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/20">
                      <Lock className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Segurança</CardTitle>
                      <CardDescription className="text-xs">
                        Gerencie sua senha de acesso
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    <div className="rounded-xl bg-secondary/30 border border-border/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          Senha com código
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Para trocar a senha, use o botão <strong>Trocar a senha</strong> na seção "Como falamos com você", logo acima: mandamos um código de 6 números para o seu e-mail e você cria a senha nova na hora.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border/30">
                      <p className="text-xs text-muted-foreground/70 leading-relaxed">
                        💡 Dica: Use uma senha forte com letras, números e símbolos para maior segurança.
                      </p>
                    </div>

                    <div className="pt-4 mt-2 border-t border-destructive/30">
                      <p className="text-xs text-muted-foreground mb-2">
                        Você pode solicitar a exclusão da sua conta e dos seus dados pessoais (LGPD).
                        Seu histórico de compras é anonimizado por exigência fiscal.
                      </p>
                      <Button
                        variant="outline"
                        className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir minha conta
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      <Dialog open={showDeleteDialog} onOpenChange={(o) => !deleting && setShowDeleteDialog(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir minha conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta ação é permanente. Seus dados pessoais (nome, CPF, e-mail, telefone) serão
              removidos e você perderá o acesso à conta. Pedidos e ingressos já emitidos são
              anonimizados — mantidos sem seus dados apenas para fins fiscais/contábeis.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {deleting ? 'Excluindo...' : 'Sim, excluir minha conta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      <Footer />
    </>
  );
};

export default MinhaConta;
