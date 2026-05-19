import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2,
  User,
  Mail,
  Phone,
  Building2,
  Sparkles,
  Settings as SettingsIcon,
  Globe,
  Upload,
  Trash2,
  ImageIcon,
  LineChart,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useImageUpload } from '@/hooks/useImageUpload';
import festpagLogo from '@/assets/logo-festpag.png';

export default function ProducerSettings() {
  const { profile, user, producerProfileId } = useAuth();
  const queryClient = useQueryClient();
  const { uploadImage, deleteImage, isUploading } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Personal
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Producer
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [document, setDocument] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPhone, setOrgPhone] = useState('');

  // Tracking
  const [metaPixelId, setMetaPixelId] = useState('');
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const [saving, setSaving] = useState(false);

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
      setLogoUrl(producerProfile.logo_url || null);
      setLegalName(producerProfile.legal_name || '');
      setDocument(producerProfile.document || '');
      setOrgEmail(producerProfile.email || '');
      setOrgPhone(producerProfile.phone || '');
      setMetaPixelId((producerProfile as any).meta_pixel_id || '');
      setTrackingEnabled(!!(producerProfile as any).tracking_enabled);
    }
  }, [producerProfile]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) {
      setLogoUrl(url);
      toast.success('Logo carregado! Lembre de salvar para confirmar.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogoRemove = async () => {
    if (logoUrl) {
      await deleteImage(logoUrl);
    }
    setLogoUrl(null);
  };

  const handleSaveAll = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const tasks: Promise<any>[] = [
        Promise.resolve(
          supabase
            .from('profiles')
            .update({ nome_completo: nome, whatsapp })
            .eq('id', user.id),
        ),
      ];

      if (producerProfileId) {
        tasks.push(
          Promise.resolve(
            supabase
              .from('producer_profiles')
              .update({
              brand_name: brandName,
              logo_url: logoUrl,
              legal_name: legalName || null,
              document: document || null,
              email: orgEmail || null,
              phone: orgPhone || null,
              meta_pixel_id: metaPixelId.trim() || null,
              tracking_enabled: trackingEnabled,
              } as any)
              .eq('id', producerProfileId),
          ),
        );
      }

      const results = await Promise.all(tasks);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      toast.success('Configurações salvas!');
      queryClient.invalidateQueries({ queryKey: ['producer-profile'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const previewLogo = logoUrl || festpagLogo;
  const previewName = brandName || 'Nome da sua produtora';

  return (
    <ProducerLayout>
      <Helmet>
        <title>Configurações | FestPag</title>
      </Helmet>

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-pink-500/10 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shrink-0">
              <SettingsIcon className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Configurações da Conta</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Gerencie seu perfil e os dados da sua produtora
              </p>
            </div>
          </div>
        </div>

        <Card className="rounded-2xl border-border/60 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-pink-500" />
          <CardContent className="p-6 sm:p-8 space-y-10">
            {/* PRODUTORA */}
            {producerProfileId && (
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-pink-500/20 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                      Produtora
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Sparkles className="h-3 w-3" />
                        Aparece em "Realização"
                      </Badge>
                    </h2>
                    <p className="text-xs text-muted-foreground">Identidade pública dos seus eventos</p>
                  </div>
                </div>

                {/* Logo + Nome */}
                <div className="flex flex-col sm:flex-row gap-6 items-start p-5 rounded-xl bg-primary/5 border border-primary/20">
                  {/* Logo */}
                  <div className="flex flex-col items-center gap-3 shrink-0 mx-auto sm:mx-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border-2 border-primary/30 flex items-center justify-center">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo da produtora" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        {logoUrl ? 'Trocar' : 'Enviar'}
                      </Button>
                      {logoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleLogoRemove}
                          disabled={isUploading}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Nome + preview */}
                  <div className="flex-1 w-full space-y-3 min-w-0">
                    <div className="space-y-2">
                      <Label htmlFor="brandName" className="text-base font-semibold">
                        Nome da Produtora
                      </Label>
                      <Input
                        id="brandName"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="Ex: Made in Brazil Bar"
                        className="h-11 text-base"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Globe className="h-3 w-3 shrink-0" />
                        Exibido como produtora oficial na página pública dos eventos.
                      </p>
                    </div>

                    {/* Pré-visualização */}
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
                        Pré-visualização (Realização)
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                          <img src={previewLogo} alt={previewName} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{previewName}</p>
                          <p className="text-xs text-muted-foreground">Produtora do evento</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dados fiscais */}
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Dados fiscais e de contato
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4">
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
                    <div className="space-y-2">
                      <Label htmlFor="orgEmail">Email de contato</Label>
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
              </section>
            )}

            {producerProfileId && <Separator />}

            {/* TRACKEAMENTO */}
            {producerProfileId && (
              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-pink-500/20 flex items-center justify-center">
                    <LineChart className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">Trackeamento</h2>
                    <p className="text-xs text-muted-foreground">
                      Configure o Meta Pixel para rastrear conversões das suas campanhas no Facebook e Instagram Ads.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Label htmlFor="trackingEnabled" className="text-sm font-semibold">
                        Ativar rastreamento
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Quando ativo, eventos como visualização e início de checkout são enviados para o Meta Pixel desta produtora.
                      </p>
                    </div>
                    <Switch
                      id="trackingEnabled"
                      checked={trackingEnabled}
                      onCheckedChange={setTrackingEnabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metaPixelId">Meta Pixel ID</Label>
                    <Input
                      id="metaPixelId"
                      value={metaPixelId}
                      onChange={(e) => setMetaPixelId(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Ex: 1234567890123456"
                      inputMode="numeric"
                      disabled={!trackingEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Encontre no Gerenciador de Eventos do Meta. Apenas números.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <Separator />


            {/* DADOS PESSOAIS */}
            <section className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Dados Pessoais</h2>
                  <p className="text-xs text-muted-foreground">Informações da sua conta de acesso</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
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
              </div>
            </section>

            <Separator />

            {/* Botão único */}
            <div className="flex justify-end">
              <Button
                onClick={handleSaveAll}
                disabled={saving || isUploading}
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-primary to-pink-500 hover:opacity-90"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProducerLayout>
  );
}
