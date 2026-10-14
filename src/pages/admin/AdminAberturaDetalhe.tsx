// Admin · uma abertura de evento (OS-221): tudo o que o produtor mandou, o que ficou
// para depois (com o motivo) e o botão que cria o evento em RASCUNHO. Nunca publica:
// a publicação continua sendo pela tela do evento, depois de conferir.
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, Loader2, Search, Sparkles } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAdminProdutores } from '@/hooks/useAdminProdutores';
import { nomeDaCategoria } from '@/lib/categorias-de-evento';
import {
  NOMES_DOS_GRUPOS, PERGUNTAS, completarRespostas, criarRascunho, etapaPreenchida, explicarErro, lerPreco, precoComTaxa, reais, type EtapaComDados,
} from '@/lib/abertura-evento';
import { copiarLink, linkDaAbertura, situacao, type LinhaAbertura } from './AdminAberturas';

const Linha = ({ k, v }: { k: string; v?: React.ReactNode }) => (
  <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{k}</span>
    <span className={v ? 'whitespace-pre-wrap break-words' : 'text-muted-foreground/60'}>{v || 'em branco'}</span>
  </div>
);

const AdminAberturaDetalhe: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);
  const [criando, setCriando] = useState(false);

  const { data: a, isLoading } = useQuery({
    queryKey: ['admin-abertura', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('aberturas_evento' as never) as unknown as ReturnType<typeof supabase.from>)
        .select('*, producer_profiles(brand_name, email)').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as (LinhaAbertura & { producer_profiles: { brand_name: string; email: string | null } | null }) | null;
    },
  });
  const { data: produtores } = useAdminProdutores(busca, 'all');

  if (isLoading) return <AdminLayout title="Abertura"><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AdminLayout>;
  if (!a) return <AdminLayout title="Abertura"><p className="py-12 text-center text-muted-foreground">Link não encontrado.</p></AdminLayout>;

  const r = completarRespostas(a.respostas as never);
  const pend = a.pendencias ?? {};
  const s = situacao(a);
  const perfilId = a.producer_profile_id ?? escolhido?.id ?? null;

  const criar = async () => {
    setCriando(true);
    try {
      const eventId = await criarRascunho(a.id, perfilId);
      toast.success('Evento criado em rascunho. Confira e publique pela tela do evento.');
      qc.invalidateQueries({ queryKey: ['admin-aberturas'] });
      navigate(`/admin/eventos/${eventId}`);
    } catch (e) { toast.error(explicarErro(e)); }
    finally { setCriando(false); }
  };

  const Parte = ({ chave, children }: { chave: EtapaComDados; children: React.ReactNode }) => {
    const nome = NOMES_DOS_GRUPOS[chave];
    const ok = etapaPreenchida(r, chave);
    const pendentes = PERGUNTAS.filter((q) => q.grupo === chave && pend[q.id]);
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {pendentes.length ? <Clock3 className="h-4 w-4 text-amber-500" /> : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
            {nome}
          </CardTitle>
          {pendentes.map((q) => <p key={q.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><b>{q.titulo}</b> ficou para depois: {pend[q.id]}</p>)}
        </CardHeader>
        <CardContent className="divide-y divide-border">{children}</CardContent>
      </Card>
    );
  };

  const p = r.produtora, e = r.evento, l = r.local;
  return (
    <AdminLayout title="Abertura de eventos">
      <div className="space-y-6">
        <button onClick={() => navigate('/admin/aberturas')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Abertura de eventos</button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="font-display text-2xl font-semibold">{a.cliente}</h1><Badge variant="outline" className={s.classe}>{s.texto}</Badge></div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{linkDaAbertura(a.token)}</p>
            {a.nota_interna && <p className="mt-2 text-sm text-muted-foreground">{a.nota_interna}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => copiarLink(a.token)}><Copy className="mr-2 h-4 w-4" /> Copiar link</Button>
            <Button variant="outline" onClick={() => window.open(linkDaAbertura(a.token), '_blank')}><ExternalLink className="mr-2 h-4 w-4" /> Abrir</Button>
          </div>
        </div>

        {/* Criar o evento */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-4 p-5">
            {a.event_id ? (
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="flex-1 text-sm">O evento já foi criado a partir deste link.</p>
                <Button onClick={() => navigate(`/admin/eventos/${a.event_id}`)}>Abrir o evento</Button>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-semibold">Criar o evento em rascunho</p>
                  <p className="text-sm text-muted-foreground">Cria o evento e os ingressos com o que veio, na conta do produtor, com a taxa de {String(a.taxa_percent).replace('.', ',')}%. Não publica. Depois disso o link trava para edição.</p>
                </div>
                {a.producer_profile_id ? (
                  <p className="text-sm">Dono: <b>{a.producer_profiles?.brand_name}</b></p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm">1. Crie a conta de produtor com o e-mail <b>{p.email || '(sem e-mail ainda)'}</b>. 2. Escolha ela aqui como dona do evento:</p>
                    {escolhido ? (
                      <p className="text-sm">Dono: <b>{escolhido.nome}</b> <button className="text-primary" onClick={() => setEscolhido(null)}>trocar</button></p>
                    ) : (
                      <>
                        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input className="bg-card pl-10" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar produtor por nome, e-mail ou documento" /></div>
                        {busca.length >= 2 && (
                          <div className="divide-y divide-border rounded-lg border border-border bg-card">
                            {(produtores ?? []).slice(0, 6).map((pp) => (
                              <button key={pp.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setEscolhido({ id: pp.id, nome: pp.brand_name })}>
                                <b>{pp.brand_name}</b> <span className="text-muted-foreground">{pp.email}</span>
                              </button>
                            ))}
                            {!produtores?.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum produtor com esse nome.</p>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <Button onClick={criar} disabled={criando || !perfilId || !l.data_inicio}>
                  {criando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Criar evento em rascunho
                </Button>
                {!l.data_inicio && <p className="text-xs text-amber-700">Falta a data de início: sem ela o evento não pode ser criado.</p>}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Parte chave="produtora">
            <Linha k="Nome no site" v={p.nome_site} />
            <Linha k={p.tipo_pessoa === 'pf' ? 'Nome completo' : 'Razão social'} v={p.razao_social} />
            <Linha k={p.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'} v={p.documento} />
            <Linha k="Responsável" v={p.responsavel_nome} />
            <Linha k="E-mail" v={p.email} />
            <Linha k="WhatsApp" v={p.whatsapp} />
            <Linha k="Logo" v={p.logo_url && <a href={p.logo_url} target="_blank" rel="noreferrer"><img src={p.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" /></a>} />
          </Parte>
          <Parte chave="evento">
            <Linha k="Nome" v={e.titulo} />
            <Linha k="Categoria" v={e.categoria && nomeDaCategoria(e.categoria)} />
            <Linha k="Texto" v={e.descricao} />
            <Linha k="Classificação" v={e.classificacao} />
            <Linha k="Visibilidade" v={e.publico === false ? 'Só por link' : 'Aberto a todos'} />
          </Parte>
          <Parte chave="local">
            <Linha k="Início" v={[l.data_inicio && new Date(`${l.data_inicio}T12:00:00`).toLocaleDateString('pt-BR'), l.hora_inicio].filter(Boolean).join(' às ')} />
            <Linha k="Fim" v={[l.data_fim && new Date(`${l.data_fim}T12:00:00`).toLocaleDateString('pt-BR'), l.hora_fim].filter(Boolean).join(' às ')} />
            <Linha k="Local" v={l.local} />
            <Linha k="Cidade" v={[l.cidade, l.uf].filter(Boolean).join('/')} />
            <Linha k="Endereço" v={l.endereco} />
          </Parte>
          <Parte chave="arte">
            <Linha k="Arte" v={r.arte.imagem_url && <a href={r.arte.imagem_url} target="_blank" rel="noreferrer"><img src={r.arte.imagem_url} alt="" className="aspect-video w-full max-w-xs rounded-lg object-cover" /></a>} />
          </Parte>
          <Parte chave="ingressos">
            {r.ingressos.lotes.filter((x) => x.nome || x.preco).map((x) => {
              const preco = lerPreco(x.preco);
              const inicio = x.inicio === 'after_lot' ? 'quando o de cima esgotar' : x.inicio === 'scheduled' ? `a partir de ${x.inicio_data ?? '?'} ${x.inicio_hora ?? ''}` : 'quando a venda abrir';
              return (
                <Linha key={x.id} k={`${x.setor || 'Ingressos'} · ${x.nome || 'sem nome'}`}
                  v={`${preco !== null ? reais(preco) : 'sem preço'} (comprador paga ${preco !== null ? reais(precoComTaxa(preco, a.taxa_percent).total) : '?'}) · ${x.quantidade || '?'} unid. · começa ${inicio}${x.fim_data ? ` · para em ${x.fim_data} ${x.fim_hora ?? ''}` : ''}`} />
              );
            })}
            <Linha k="Meia-entrada" v={r.ingressos.meia} />
            <Linha k="Cupons" v={r.ingressos.cupons} />
            <Linha k="Cortesias" v={r.ingressos.cortesias} />
          </Parte>
          <Parte chave="acessos">
            {r.acessos.pessoas.filter((x) => x.nome).map((x) => <Linha key={x.id} k={x.nome} v={`${x.funcao}${x.whatsapp ? ` · ${x.whatsapp}` : ''}`} />)}
            {!r.acessos.pessoas.some((x) => x.nome) && <Linha k="Pessoas" />}
          </Parte>
        </div>
        <p className="text-xs text-muted-foreground">Cupons, cortesias e acessos da equipe não são criados sozinhos: a equipe cria pelo painel do evento com o que está aqui.</p>
      </div>
    </AdminLayout>
  );
};

export default AdminAberturaDetalhe;
