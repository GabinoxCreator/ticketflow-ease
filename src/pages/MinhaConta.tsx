import { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Phone, Lock, Camera, Save, Loader2, CheckCircle2, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import TicketCard, { TicketData } from '@/components/TicketCard';

const profileSchema = z.object({
  nome_completo: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  whatsapp: z.string().min(10, 'WhatsApp inválido').max(20, 'WhatsApp inválido'),
  email: z.string().email('Email inválido'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const MinhaConta = () => {
  const { user, profile } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRequestingPasswordReset, setIsRequestingPasswordReset] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nome_completo: profile?.nome_completo || '',
      whatsapp: profile?.whatsapp || '',
      email: profile?.email || '',
    },
  });

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
      const { error } = await supabase
        .from('profiles')
        .update({
          nome_completo: data.nome_completo,
          whatsapp: data.whatsapp,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error(`Erro ao atualizar perfil: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;

    setIsRequestingPasswordReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/auth?mode=reset-password`,
      });

      if (error) throw error;

      setPasswordResetSent(true);
      toast.success('Email de redefinição enviado! Verifique sua caixa de entrada.');
    } catch (error: any) {
      toast.error(`Erro ao enviar email: ${error.message}`);
    } finally {
      setIsRequestingPasswordReset(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Minha Conta | IngressosRP</title>
        <meta name="description" content="Gerencie seu perfil e configurações de conta." />
      </Helmet>

      <Header />

      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                Minha Conta
              </h1>
            </div>
            <p className="text-muted-foreground">
              Gerencie suas informações pessoais e configurações
            </p>
          </motion.div>

          {/* Profile Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Informações Pessoais
                </CardTitle>
                <CardDescription>
                  Atualize suas informações de perfil
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <Avatar className="w-20 h-20">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                        {profile?.nome_completo ? getInitials(profile.nome_completo) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{profile?.nome_completo}</p>
                      <p className="text-sm text-muted-foreground">{profile?.email}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Nome Completo */}
                  <div className="space-y-2">
                    <Label htmlFor="nome_completo">Nome Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="nome_completo"
                        {...register('nome_completo')}
                        className="pl-10"
                        placeholder="Seu nome completo"
                      />
                    </div>
                    {errors.nome_completo && (
                      <p className="text-sm text-destructive">{errors.nome_completo.message}</p>
                    )}
                  </div>

                  {/* Email (read-only) */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        {...register('email')}
                        className="pl-10 bg-muted"
                        disabled
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O email não pode ser alterado diretamente. Entre em contato com o suporte se precisar alterá-lo.
                    </p>
                  </div>

                  {/* WhatsApp */}
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="whatsapp"
                        {...register('whatsapp')}
                        className="pl-10"
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

          {/* Password Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Segurança
                </CardTitle>
                <CardDescription>
                  Altere sua senha de acesso
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Para alterar sua senha, enviaremos um email de verificação para{' '}
                    <strong className="text-foreground">{profile?.email}</strong>.
                    Clique no link do email para criar uma nova senha.
                  </p>

                  {passwordResetSent ? (
                    <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      <div>
                        <p className="font-medium text-green-500">Email enviado!</p>
                        <p className="text-sm text-muted-foreground">
                          Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handlePasswordReset}
                      disabled={isRequestingPasswordReset}
                    >
                      {isRequestingPasswordReset ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Enviar Email de Redefinição
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Example Ticket Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="w-5 h-5" />
                  Exemplo de Ingresso
                </CardTitle>
                <CardDescription>
                  Veja como seus ingressos são exibidos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TicketCard
                  ticket={{
                    id: 'example-ticket-id',
                    ticketCode: 'TKT-2024-ABCD1234',
                    holderName: profile?.nome_completo || 'Seu Nome',
                    status: 'valid',
                    event: {
                      title: 'Sunset Festival - Edição de Verão 2024',
                      date: '2024-12-28',
                      time: '16:00:00',
                      venue: 'Parque Villa-Lobos',
                      city: 'São Paulo',
                      state: 'SP',
                      imageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&auto=format&fit=crop',
                    },
                    lot: {
                      name: '1º Lote - Pista',
                      price: 150.00,
                    },
                    purchaseDate: new Date().toISOString(),
                    paymentMethod: 'Pix',
                  }}
                />
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default MinhaConta;
