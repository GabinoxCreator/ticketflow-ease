import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Phone, Lock, Save, Loader2, Shield, Sparkles, CreditCard } from 'lucide-react';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import { toast } from 'sonner';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PasswordResetOTPFlow from '@/components/auth/PasswordResetOTPFlow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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

const MinhaConta = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

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
      const update: Record<string, unknown> = {
        nome_completo: data.nome_completo,
        whatsapp: data.whatsapp,
      };
      // Only set CPF if currently empty in profile, or if it actually changed
      if (cpfDigits.length === 11) {
        update.cpf = cpfDigits;
      }

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error(`Erro ao atualizar perfil: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Fluxo legacy substituído pelo OTP via email (PasswordResetOTPFlow)

  return (
    <>
      <Helmet>
        <title>Minha Conta | FestPag</title>
        <meta name="description" content="Gerencie seu perfil e configurações de conta." />
      </Helmet>

      <Header />

      <main className="min-h-screen bg-background pt-24 pb-16 relative overflow-hidden">
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
                        O email não pode ser alterado. Entre em contato com o suporte se precisar.
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
                    <div className="rounded-xl bg-secondary/30 border border-border/50 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          Redefinição por Código
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Enviaremos um código de 6 dígitos para o email abaixo. Use-o para criar uma nova senha em poucos segundos.
                      </p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/60 border border-border/50">
                        <Mail className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-medium text-foreground break-all">
                          {profile?.email}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="gradient"
                      className="w-full"
                      onClick={() => setShowResetDialog(true)}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Redefinir Senha por Código
                    </Button>

                    <div className="pt-2 border-t border-border/30">
                      <p className="text-xs text-muted-foreground/70 leading-relaxed">
                        💡 Dica: Use uma senha forte com letras, números e símbolos para maior segurança.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          <PasswordResetOTPFlow
            initialEmail={profile?.email || ''}
            onBack={() => setShowResetDialog(false)}
            onSuccess={() => {
              setShowResetDialog(false);
              toast.success('Senha redefinida! Use a nova senha no próximo acesso.');
            }}
          />
        </DialogContent>
      </Dialog>

      <Footer />
    </>
  );
};

export default MinhaConta;
