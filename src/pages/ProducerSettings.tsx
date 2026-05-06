import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User, Mail, Phone, Building2, Sparkles, Settings as SettingsIcon, Globe } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import festpagLogo from '@/assets/logo-festpag.png';

export default function ProducerSettings() {
  const { profile, user, producerProfileId } = useAuth();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [document, setDocument] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  const { data: producerProfile } = useQuery({
    queryKey: ['producer-profile', producerProfileId],
    queryFn: async () => {
      if (!producerProfileId) return null;
      const { data, error } = await supabase
        .from('producer_profiles')
        .select('*')
        .eq('id', producerProfileId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!producerProfileId,
  });

  useEffect(() => {
    if (profile) {
      setNome(profile.nome_completo || '');
      setWhatsapp(profile.whatsapp || '');
    }
  }, [profile]);

  useEffect(() => {
    if (producerProfile) {
      setBrandName(producerProfile.brand_name || '');
      setLegalName(producerProfile.legal_name || '');
      setDocument(producerProfile.document || '');
      setOrgEmail(producerProfile.email || '');
      setOrgPhone(producerProfile.phone || '');
    }
  }, [producerProfile]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({ nome_completo: nome, whatsapp })
      .eq('id', user.id);
    setSavingProfile(false);
    if (error) toast.error('Erro ao salvar perfil');
    else toast.success('Perfil atualizado!');
  };

  const handleSaveOrg = async () => {
    if (!producerProfileId) return;
    setSavingOrg(true);
    const { error } = await supabase
      .from('producer_profiles')
      .update({
        brand_name: brandName,
        legal_name: legalName || null,
        document: document || null,
        email: orgEmail || null,
        phone: orgPhone || null,
      })
      .eq('id', producerProfileId);
    setSavingOrg(false);
    if (error) {
      toast.error('Erro ao salvar dados da produtora');
    } else {
      toast.success('Produtora atualizada!');
      queryClient.invalidateQueries({ queryKey: ['producer-profile'] });
    }
  };

  const logoUrl = producerProfile?.logo_url || festpagLogo;
  const previewName = brandName || 'Nome da sua produtora';

  return (
    <ProducerLayout>
      <Helmet>
        <title>Configurações | FestPag</title>
      </Helmet>

      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-pink-500/10 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shrink-0">
              <SettingsIcon className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Configurações</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Gerencie seu perfil e os dados da sua produtora
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Dados Pessoais */}
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Dados Pessoais</h2>
                  <p className="text-xs text-muted-foreground">Informações da sua conta</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" value={user?.email || ''} disabled className="pl-9 bg-muted" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="whatsapp"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveProfile} disabled={savingProfile} size="lg" className="w-full sm:w-auto">
                  {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Perfil
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Produtora */}
          {producerProfileId && (
            <Card className="rounded-2xl border-border/60 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-pink-500" />
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-pink-500/20 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Produtora</h2>
                    <p className="text-xs text-muted-foreground">Aparece publicamente nos seus eventos</p>
                  </div>
                </div>

                <Separator />

                {/* Nome da produtora — destaque */}
                <div className="space-y-2 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="brandName" className="text-base font-semibold">
                      Nome da Produtora
                    </Label>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Sparkles className="h-3 w-3" />
                      Aparece em "Realização"
                    </Badge>
                  </div>
                  <Input
                    id="brandName"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Ex: ND Eventos"
                    className="h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3 w-3" />
                    Este nome será exibido como produtora oficial na página pública dos seus eventos.
                  </p>

                  {/* Preview ao vivo */}
                  <div className="mt-3 p-3 rounded-lg bg-card border border-border">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
                      Pré-visualização
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        <img src={logoUrl} alt={previewName} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{previewName}</p>
                        <p className="text-xs text-muted-foreground">Produtora do evento</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dados fiscais e de contato */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Dados fiscais e de contato
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="legalName">Razão Social</Label>
                    <Input
                      id="legalName"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      placeholder="Razão social (opcional)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="document">CNPJ / CPF</Label>
                    <Input
                      id="document"
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgEmail">Email</Label>
                      <Input
                        id="orgEmail"
                        type="email"
                        value={orgEmail}
                        onChange={(e) => setOrgEmail(e.target.value)}
                        placeholder="contato@suaprodutora.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orgPhone">Telefone</Label>
                      <Input
                        id="orgPhone"
                        value={orgPhone}
                        onChange={(e) => setOrgPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveOrg}
                    disabled={savingOrg}
                    size="lg"
                    className="w-full sm:w-auto bg-gradient-to-r from-primary to-pink-500 hover:opacity-90"
                  >
                    {savingOrg && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Produtora
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProducerLayout>
  );
}
