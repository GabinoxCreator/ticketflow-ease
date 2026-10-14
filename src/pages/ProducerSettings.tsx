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
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Instagram,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useImageUpload } from '@/hooks/useImageUpload';
import festpagLogo from '@/assets/logo-festpag.png';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHAVE_PENDENCIAS_REPASSE, documentoValido, soDigitos } from '@/lib/repasseDocumento';
import {
  PIN_CRIE_ANTES,
  PIN_PARA_TROCAR_DOCUMENTO,
  chamarPin,
  useMeuPin,
  type RespostaPin,
} from '@/lib/pinRepasse';
import { PinConfirmDialog } from '@/components/producer/PinConfirmDialog';

// Mesma régua do banco (slug_de_texto): minúsculo, sem acento, sem espaço e sem pontuação.
function normalizarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 60);
}

// Aceita "@perfil", "perfil" ou o link do Instagram; guarda só o nome do perfil.
function limparInstagram(texto: string): string {
  const semLink = texto.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '');
  return semLink.split(/[/?#\s]/)[0].replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
}

const MENSAGEM_SLUG: Record<'curto' | 'reservado' | 'ocupado', string> = {
  curto: 'O endereço precisa ter pelo menos 3 letras ou números.',
  reservado: 'Esse endereço é usado pelo próprio site. Escolha outro.',
  ocupado: 'Esse endereço já é de outra produtora. Escolha outro.',
};

export default function ProducerSettings() {
  const { profile, user, producerProfileId, userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const [selectedProducerId, setSelectedProducerId] = useState<string | null>(null);
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

  // Endereço da página própria (OS-219): festpag.digital/<slug>. Nasce do nome
  // da produtora no banco; aqui o produtor pode trocar. Vazio = volta ao automático.
  const [slug, setSlug] = useState('');
  const [slugSituacao, setSlugSituacao] = useState<'ok' | 'curto' | 'reservado' | 'ocupado' | null>(null);
  // O que aparece na página: capa, texto "Sobre" e Instagram (decisão do Gabriel, 13/10).
  const [capaUrl, setCapaUrl] = useState<string | null>(null);
  const [sobre, setSobre] = useState('');
  const [instagram, setInstagram] = useState('');
  const capaInputRef = useRef<HTMLInputElement>(null);

  // Tracking
  const [metaPixelId, setMetaPixelId] = useState('');
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  // Token da API de Conversões (o envio pelo servidor). O token NUNCA volta do
  // banco para cá: o painel só consegue perguntar SE existe um guardado.
  const [capiToken, setCapiToken] = useState('');
  const [capiConfigurado, setCapiConfigurado] = useState(false);

  const [saving, setSaving] = useState(false);

  const effectiveProducerId = isAdmin ? selectedProducerId : producerProfileId;

  const { data: adminProducers } = useQuery({
    queryKey: ['admin-all-producers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_profiles')
        .select('id, brand_name, logo_url')
        .order('brand_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (isAdmin && !selectedProducerId && adminProducers && adminProducers.length > 0) {
      setSelectedProducerId(adminProducers[0].id);
    }
  }, [isAdmin, adminProducers, selectedProducerId]);

  const { data: producerProfile } = useQuery({
    queryKey: ['producer-profile', effectiveProducerId],
    queryFn: async () => {
      if (!effectiveProducerId) return null;
      const { data, error } = await supabase
        .from('producer_profiles')
        .select('*')
        .eq('id', effectiveProducerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveProducerId,
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
      setSlug(producerProfile.slug || '');
      setCapaUrl((producerProfile as any).pagina_capa_url || null);
      setSobre((producerProfile as any).pagina_sobre || '');
      setInstagram((producerProfile as any).pagina_instagram || '');
      setMetaPixelId((producerProfile as any).meta_pixel_id || '');
      setTrackingEnabled(!!(producerProfile as any).tracking_enabled);
    }
  }, [producerProfile]);

  useEffect(() => {
    if (!effectiveProducerId) { setCapiConfigurado(false); return; }
    let cancelado = false;
    supabase
      .rpc('has_meta_capi_token' as any, { _producer_profile_id: effectiveProducerId } as any)
      .then(({ data }) => { if (!cancelado) setCapiConfigurado(data === true); });
    return () => { cancelado = true; };
  }, [effectiveProducerId]);

  const slugSalvo = producerProfile?.slug || '';
  const slugMudou = !!effectiveProducerId && slug !== slugSalvo;
  const paginaMudou =
    !!effectiveProducerId &&
    ((capaUrl || null) !== ((producerProfile as any)?.pagina_capa_url || null) ||
      (sobre.trim() || null) !== ((producerProfile as any)?.pagina_sobre || null) ||
      (limparInstagram(instagram) || null) !== ((producerProfile as any)?.pagina_instagram || null));

  // Pergunta ao banco se o endereço novo está livre, meio segundo depois de parar de digitar.
  useEffect(() => {
    if (!slugMudou || slug === '') { setSlugSituacao(null); return; }
    let cancelado = false;
    const t = setTimeout(() => {
      supabase
        .rpc('endereco_produtor_livre' as any, { _slug: slug, _producer_profile_id: effectiveProducerId } as any)
        .then(({ data }) => { if (!cancelado) setSlugSituacao((data as any) ?? null); });
    }, 500);
    return () => { cancelado = true; clearTimeout(t); };
  }, [slug, slugMudou, effectiveProducerId]);

  const handleCapaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) {
      setCapaUrl(url);
      toast.success('Capa carregada! Lembre de salvar para confirmar.');
    }
    if (capaInputRef.current) capaInputRef.current.value = '';
  };

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

  // OS-166: o CPF/CNPJ da produtora só se troca com o PIN, conferido no banco
  // (`salvar_documento_da_produtora`). A casa (admin) continua corrigindo direto.
  const { data: meuPin } = useMeuPin();
  const [pedindoPin, setPedindoPin] = useState(false);
  const documentoMudou =
    !isAdmin && !!effectiveProducerId && soDigitos(document) !== soDigitos(producerProfile?.document);

  const handleSaveAll = async () => {
    if (!user?.id) return;
    if (slugMudou && slugSituacao && slugSituacao !== 'ok') {
      toast.error(MENSAGEM_SLUG[slugSituacao]);
      return;
    }
    if (documentoMudou) {
      if (document.trim() !== '' && !documentoValido(document)) {
        toast.error('Número de CPF ou CNPJ inválido.');
        return;
      }
      if (meuPin && !meuPin.tem_pin) {
        toast.error(PIN_CRIE_ANTES);
        return;
      }
      setPedindoPin(true);
      return;
    }
    await salvarTudo(null);
  };

  // `pin` só vem quando o documento mudou. O documento vai PRIMEIRO: com o PIN
  // errado, nada é salvo (é o que a frase "Nada foi trocado." promete).
  const salvarTudo = async (pin: string | null): Promise<RespostaPin> => {
    if (!user?.id) return { ok: false, error: 'falha' };
    if (pin !== null && effectiveProducerId) {
      setSaving(true);
      const r = await chamarPin('salvar_documento_da_produtora', {
        _producer_profile_id: effectiveProducerId,
        _documento: document,
        _pin: pin,
      });
      if (!r.ok) {
        setSaving(false);
        return r;
      }
      setPedindoPin(false);
    }
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

      if (effectiveProducerId) {
        tasks.push(
          Promise.resolve(
            supabase
              .from('producer_profiles')
              .update({
              brand_name: brandName,
              logo_url: logoUrl,
              legal_name: legalName || null,
              // Produtor: o documento já foi (ou não precisou) pela função com PIN.
              ...(isAdmin ? { document: document || null } : {}),
              email: orgEmail || null,
              phone: orgPhone || null,
              meta_pixel_id: metaPixelId.trim() || null,
              tracking_enabled: trackingEnabled,
              // Só vai quando mudou: vazio faz o banco gerar de novo a partir do nome.
              ...(slugMudou ? { slug: slug || null } : {}),
              // Os campos da página só vão quando mudaram: quem não mexe neles
              // salva igual a antes (inclusive se a migration ainda não subiu).
              ...(paginaMudou
                ? {
                    pagina_capa_url: capaUrl,
                    pagina_sobre: sobre.trim() || null,
                    pagina_instagram: limparInstagram(instagram) || null,
                  }
                : {}),
              } as any)
              .eq('id', effectiveProducerId),
          ),
        );
      }

      const results = await Promise.all(tasks);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      // O token da API de Conversões não passa pelo UPDATE da tabela: vai por
      // RPC, porque a tabela dele é fechada até para o próprio dono.
      if (effectiveProducerId && capiToken.trim()) {
        const { error: erroToken } = await supabase.rpc('set_meta_capi_token' as any, {
          _producer_profile_id: effectiveProducerId,
          _token: capiToken.trim(),
        } as any);
        if (erroToken) throw erroToken;
        setCapiToken('');
        setCapiConfigurado(true);
      }

      toast.success('Configurações salvas!');
      queryClient.invalidateQueries({ queryKey: ['producer-profile'] });
      // O aviso do Financeiro (o que falta para pedir repasse) muda com o documento.
      queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENCIAS_REPASSE] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
    return { ok: true };
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
            {/* ADMIN: seletor de produtora */}
            {isAdmin && (
              <section className="space-y-3 p-5 rounded-xl bg-red-500/5 border border-red-500/30">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      Gerenciando produtora
                      <Badge variant="destructive" className="text-[10px]">Admin</Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Selecione qual produtora você quer configurar.
                    </p>
                  </div>
                </div>
                <Select
                  value={selectedProducerId || ''}
                  onValueChange={(v) => setSelectedProducerId(v)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione uma produtora" />
                  </SelectTrigger>
                  <SelectContent>
                    {(adminProducers || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.brand_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
            )}

            {/* PRODUTORA */}
            {effectiveProducerId && (
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

                {/* Endereço da página própria (OS-219) */}
                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-base font-semibold flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    Endereço da sua página
                  </Label>
                  <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted border-r border-input select-none">
                      festpag.digital/
                    </span>
                    <input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(normalizarSlug(e.target.value))}
                      placeholder="nomedasuaprodutora"
                      className="flex-1 min-w-0 h-11 px-3 text-base bg-transparent outline-none"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  {slugMudou ? (
                    <p className={`text-xs ${slugSituacao && slugSituacao !== 'ok' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {slug === ''
                        ? 'Vazio: ao salvar, o endereço volta a ser o nome da produtora.'
                        : slugSituacao === 'ok'
                          ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Endereço livre. Salve para valer.</span>
                          : slugSituacao
                            ? MENSAGEM_SLUG[slugSituacao]
                            : 'Conferindo...'}
                    </p>
                  ) : slugSalvo ? (
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <span className="text-muted-foreground">Todos os seus eventos à venda, num link só.</span>
                      <a
                        href={`/${slugSalvo}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir minha página
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(`https://festpag.digital/${slugSalvo}`)
                            .then(() => toast.success('Link copiado!'))
                            .catch(() => toast.error('Não deu para copiar. Selecione o endereço e copie.'));
                        }}
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <Copy className="h-3 w-3" /> Copiar link
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* O que aparece na página (OS-219) */}
                <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
                  <div>
                    <p className="text-sm font-semibold">Sua página</p>
                    <p className="text-xs text-muted-foreground">
                      O que aparece em festpag.digital/{slugSalvo || slug || 'seuendereco'}. Tudo opcional.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Capa</Label>
                    <input
                      ref={capaInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleCapaUpload}
                      className="hidden"
                    />
                    <div className="relative h-28 sm:h-36 rounded-xl overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-pink-500/20 border border-border">
                      {capaUrl ? (
                        <img src={capaUrl} alt="Capa da página" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
                          Sem capa, a página usa a arte do seu próximo evento.
                        </div>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => capaInputRef.current?.click()} disabled={isUploading}>
                        <Upload className="h-3 w-3 mr-1" />
                        {capaUrl ? 'Trocar capa' : 'Enviar capa'}
                      </Button>
                      {capaUrl && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCapaUrl(null)} disabled={isUploading}>
                          <Trash2 className="h-3 w-3 mr-1" /> Tirar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Imagem deitada, de preferência 1600 x 500.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sobre">Sobre a produtora</Label>
                    <Textarea
                      id="sobre"
                      value={sobre}
                      onChange={(e) => setSobre(e.target.value.slice(0, 1000))}
                      placeholder="Conte em poucas linhas quem vocês são e que tipo de evento fazem."
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground text-right">{sobre.length}/1000</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instagram">Instagram</Label>
                    <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                      <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted border-r border-input select-none">
                        <Instagram className="h-4 w-4 mr-1.5" />@
                      </span>
                      <input
                        id="instagram"
                        value={instagram}
                        onChange={(e) => setInstagram(limparInstagram(e.target.value))}
                        placeholder="suaprodutora"
                        className="flex-1 min-w-0 h-10 px-3 text-sm bg-transparent outline-none"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
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
                      {/* OS-157: o repasse só sai com este número certo. */}
                      {document.trim() !== '' && !documentoValido(document) && (
                        <p className="text-xs text-destructive">Número de CPF ou CNPJ inválido.</p>
                      )}
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

            {effectiveProducerId && <Separator />}

            {/* TRACKEAMENTO */}
            {effectiveProducerId && (
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

                  <div className="space-y-2">
                    <Label htmlFor="capiToken">
                      Token da API de Conversões{' '}
                      <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="capiToken"
                      type="password"
                      value={capiToken}
                      onChange={(e) => setCapiToken(e.target.value)}
                      placeholder={capiConfigurado ? 'Token guardado — cole um novo para substituir' : 'Cole aqui o token gerado no Gerenciador de Eventos'}
                      autoComplete="off"
                      disabled={!trackingEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {capiConfigurado
                        ? '✅ Token guardado. Cada venda confirmada é enviada à Meta também pelo nosso servidor, o que não se perde com bloqueador de anúncio nem no iPhone.'
                        : 'Com ele, cada venda confirmada é enviada à Meta também pelo nosso servidor — o navegador sozinho perde parte das compras (bloqueador de anúncio, iPhone, aba fechada depois do PIX). Por segurança o token nunca é mostrado de volta.'}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground border-t border-primary/20 pt-4">
                    Só medimos quem autoriza cookies de marketing no aviso do site — é o que a LGPD exige. Quem recusa não é enviado à Meta.
                  </p>
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
      <PinConfirmDialog
        open={pedindoPin}
        descricao={PIN_PARA_TROCAR_DOCUMENTO}
        onCancelar={() => setPedindoPin(false)}
        onConfirmar={(pin) => salvarTudo(pin)}
      />
    </ProducerLayout>
  );
}
