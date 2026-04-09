import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User, Mail, Phone, Building2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function ProducerSettings() {
  const { profile, user, producerProfileId } = useAuth();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Org state
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
    if (error) {
      toast.error('Erro ao salvar perfil');
    } else {
      toast.success('Perfil atualizado!');
    }
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
      toast.error('Erro ao salvar dados da organização');
    } else {
      toast.success('Organização atualizada!');
      queryClient.invalidateQueries({ queryKey: ['producer-profile'] });
    }
  };

  return (
    <ProducerLayout>
      <Helmet>
        <title>Configurações | FestPag</title>
      </Helmet>

      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie seu perfil e organização</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Input id="whatsapp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Perfil
            </Button>
          </CardContent>
        </Card>

        {producerProfileId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dados da Organização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Nome da Marca / Organização</Label>
                <Input id="brandName" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Nome público da sua organização" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="legalName">Razão Social</Label>
                <Input id="legalName" value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Razão social (opcional)" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">CNPJ / CPF</Label>
                <Input id="document" value={document} onChange={e => setDocument(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgEmail">Email da Organização</Label>
                <Input id="orgEmail" type="email" value={orgEmail} onChange={e => setOrgEmail(e.target.value)} placeholder="contato@suaorg.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgPhone">Telefone da Organização</Label>
                <Input id="orgPhone" value={orgPhone} onChange={e => setOrgPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>

              <Button onClick={handleSaveOrg} disabled={savingOrg}>
                {savingOrg && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Organização
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ProducerLayout>
  );
}
