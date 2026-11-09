import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Link2, Copy, EyeOff, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatInSaoPaulo } from '@/lib/eventTime';
import { isLotOpenForSale, type LotForAvailability } from '@/lib/lot-availability';

/*
 * VENDA POR LINK (OS-405, 08/11/2026): a casa cria um lote ESCONDIDO (não aparece na
 * página do evento, no totem, na maquininha nem na portaria) e gera um link que abre o
 * checkout com o carrinho pronto. Nasceu da meia do Fogo & Fumaça.
 *
 * Decisões do Gabriel (08/11): só o admin da casa gera; o link vale para UMA compra e
 * vence em 24 horas, com o preço do momento em que foi gerado, enquanto o lote estiver
 * aberto ("Não, recusa quando o lote vira"); a meia é a metade do lote
 * aberto (a tela sugere a metade do lote de referência, e o preço fica editável para
 * outros casos, como PcD ou condição combinada com o produtor).
 *
 * O banco é quem guarda: `event_lots.escondido` só a casa liga (gatilho), e o link nasce
 * pela função `admin_criar_link_de_venda`, que grava lotes, quantidades e preços.
 */

interface Lote {
  id: string;
  name: string;
  sector_name: string | null;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity: number | null;
  is_active: boolean;
  escondido?: boolean | null;
  retirada_publica?: boolean | null;
  group_ticket_enabled?: boolean | null;
  group_ticket_quantity?: number | null;
  modo_taxa?: string | null;
  max_parcelas?: number | null;
  parcelas_sem_juros?: number | null;
  event_day_id?: string | null;
  covers_all_days?: boolean | null;
  end_date?: string | null;
}

interface LinkCriado {
  id: string;
  token: string;
  nota: string | null;
  criado_em: string;
  expira_em: string;
  situacao: 'valendo' | 'em_pagamento' | 'usado' | 'vencido' | 'cancelado' | 'lote_encerrado';
  pedido_id: string | null;
  itens: Array<{ lot_id: string; nome: string | null; setor: string | null; quantidade: number; preco: number }>;
}

const SITUACAO: Record<LinkCriado['situacao'], { rotulo: string; cor: string }> = {
  valendo: { rotulo: 'Valendo', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  em_pagamento: { rotulo: 'Pagamento em andamento', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
  usado: { rotulo: 'Usado', cor: 'bg-sky-50 text-sky-700 border-sky-200' },
  vencido: { rotulo: 'Vencido', cor: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-red-50 text-red-700 border-red-200' },
  lote_encerrado: { rotulo: 'Lote encerrou', cor: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

const ERRO: Record<string, string> = {
  sem_permissao: 'Só o admin da FestPag gera link de venda.',
  evento_nao_publicado: 'O evento precisa estar publicado.',
  evento_fora_do_marcel: 'Este evento não vende pela rota do Marcel; o link não funciona nele.',
  carrinho_vazio: 'Escolha ao menos um ingresso.',
  quantidade_invalida: 'Quantidade inválida (de 1 a 10 por lote).',
  lote_inativo: 'Um dos lotes está desativado.',
  lote_de_cortesia: 'Lote da cortesia por link não entra no link de venda.',
  lote_em_grupo: 'Lote em grupo (dupla) não entra no link de venda.',
  lote_sem_preco: 'Lote de preço zero não entra no link de venda.',
  lote_de_outro_evento: 'Lote de outro evento.',
  lote_repetido: 'O mesmo lote apareceu duas vezes.',
  lote_encerrado: 'Um dos lotes já encerrou: o link só vende lote aberto.',
  lote_ainda_nao_abriu: 'Um dos lotes ainda não abriu: o link só vende lote aberto.',
  link_ja_usado: 'Este link já foi usado; não dá para cancelar.',
};

const formatMoney = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);

const nomeDoLote = (l: { name?: string | null; nome?: string | null; sector_name?: string | null; setor?: string | null }) => {
  const nome = (l.name ?? l.nome ?? '').trim();
  const setor = (l.sector_name ?? l.setor ?? '').trim();
  return setor && !nome.toLowerCase().includes(setor.toLowerCase()) ? `${setor} · ${nome}` : nome;
};

// Sempre o endereço do site no ar: o link vai para o cliente pelo WhatsApp, e gerado
// numa prévia ou no endereço do Lovable ele apontaria para o lugar errado.
const SITE_NO_AR = 'https://festpag.digital';
const urlDoLink = (token: string) => `${SITE_NO_AR}/link/${token}`;

// As funções novas ainda não estão nos tipos gerados (types.ts é do Lovable).
interface RespostaDaCasa { ok?: boolean; erro?: string; links?: LinkCriado[]; token?: string; expira_em?: string }
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: RespostaDaCasa | null; error: { message?: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc).call(supabase, fn, args);

const copiar = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success('Link copiado');
  } catch {
    toast.error('Não deu para copiar. Selecione o link e copie à mão.');
  }
};

export const VendaPorLink: React.FC<{ eventId: string; eventStatus: string }> = ({ eventId, eventStatus }) => {
  const queryClient = useQueryClient();
  const [quantidades, setQuantidades] = React.useState<Record<string, number>>({});
  const [nota, setNota] = React.useState('');
  const [ultimo, setUltimo] = React.useState<{ token: string; expira_em: string } | null>(null);
  const [criarLoteAberto, setCriarLoteAberto] = React.useState(false);

  const lotesQ = useQuery({
    queryKey: ['admin-venda-por-link-lotes', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_lots')
        .select('*')
        .eq('event_id', eventId)
        .order('price', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Lote[];
    },
  });

  const linksQ = useQuery({
    queryKey: ['admin-links-de-venda', eventId],
    queryFn: async () => {
      const { data, error } = await rpc('admin_links_de_venda', { _event_id: eventId });
      if (error) throw error;
      if (!data?.ok) throw new Error(ERRO[data?.erro] ?? 'Não foi possível ler os links.');
      return data.links || [];
    },
  });

  // Entra no link: o lote à venda AGORA (a mesma regra da página do evento) ou um lote
  // escondido ativo; com preço, fora da cortesia e fora do grupo (dupla). Lote encerrado
  // fica de fora para ninguém gerar link pelo preço de um lote que já passou.
  const todos = (lotesQ.data || []) as unknown as LotForAvailability[];
  const lotesDoLink = (lotesQ.data || []).filter((l) =>
    (l.escondido ? l.is_active : isLotOpenForSale(l as unknown as LotForAvailability, todos))
    && Number(l.price) > 0 && !l.retirada_publica
    && !(l.group_ticket_enabled && Number(l.group_ticket_quantity) >= 2));

  const itensEscolhidos = Object.entries(quantidades).filter(([, q]) => q > 0);
  const totalEscolhido = itensEscolhidos.reduce((s, [id, q]) => {
    const l = lotesDoLink.find((x) => x.id === id);
    return s + (l ? Number(l.price) * q : 0);
  }, 0);

  const mudar = (id: string, delta: number) =>
    setQuantidades((prev) => ({ ...prev, [id]: Math.max(0, Math.min(10, (prev[id] || 0) + delta)) }));

  const gerar = useMutation({
    mutationFn: async () => {
      const itens = itensEscolhidos.map(([lot_id, quantidade]) => ({ lot_id, quantidade }));
      const { data, error } = await rpc('admin_criar_link_de_venda', {
        _event_id: eventId, _itens: itens, _nota: nota.trim() || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(ERRO[data?.erro] ?? 'Não foi possível gerar o link.');
      return data as { token: string; expira_em: string };
    },
    onSuccess: (data) => {
      setUltimo({ token: data.token, expira_em: data.expira_em });
      setQuantidades({});
      setNota('');
      queryClient.invalidateQueries({ queryKey: ['admin-links-de-venda', eventId] });
      toast.success('Link gerado');
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível gerar o link.'),
  });

  const cancelar = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await rpc('admin_cancelar_link_de_venda', { _link_id: linkId });
      if (error) throw error;
      if (!data?.ok) throw new Error(ERRO[data?.erro] ?? 'Não foi possível cancelar.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-links-de-venda', eventId] });
      toast.success('Link cancelado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Venda por link
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setCriarLoteAberto(true)}>
          <EyeOff className="h-4 w-4 mr-1" /> Criar lote escondido
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Monte o carrinho e gere um link: ele abre o pagamento já com os ingressos escolhidos,
          vale para <strong>uma compra</strong> e vence em <strong>24 horas</strong>, com o preço
          de agora enquanto o lote estiver aberto (se o lote encerrar ou esgotar, o link para de
          vender). Lote escondido não aparece na página do evento e só sai por link.
        </p>

        {eventStatus !== 'published' && (
          <p className="text-sm text-amber-700">O evento precisa estar publicado para o link funcionar.</p>
        )}

        {/* Montar o carrinho */}
        <div className="space-y-2">
          {lotesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando lotes…</p>
          ) : lotesDoLink.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lote ativo com preço.</p>
          ) : (
            lotesDoLink.map((l) => {
              const q = quantidades[l.id] || 0;
              const disponivel = Number(l.total_quantity) - Number(l.sold_quantity) - Number(l.reserved_quantity || 0);
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-2">
                      {nomeDoLote(l)}
                      {l.escondido && (
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">
                          escondido
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(Number(l.price))} · {disponivel > 0 ? `${disponivel} disponíveis` : 'esgotado'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudar(l.id, -1)} disabled={q === 0}
                      aria-label={`Tirar um ${nomeDoLote(l)}`}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center tabular-nums">{q}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudar(l.id, 1)} disabled={q >= 10}
                      aria-label={`Pôr um ${nomeDoLote(l)}`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="nota-link">Para quem (só a casa vê)</Label>
            <Input id="nota-link" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: Thais, mãe e filha" maxLength={120} />
          </div>
          <Button onClick={() => gerar.mutate()} disabled={itensEscolhidos.length === 0 || gerar.isPending}>
            {gerar.isPending ? 'Gerando…' : `Gerar link${itensEscolhidos.length ? ` · ${formatMoney(totalEscolhido)}` : ''}`}
          </Button>
        </div>

        {ultimo && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-800">
              Link pronto. Vale até {formatInSaoPaulo(ultimo.expira_em)}, para uma compra.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={urlDoLink(ultimo.token)} className="bg-white text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="sm" onClick={() => copiar(urlDoLink(ultimo.token))}>
                <Copy className="h-4 w-4 mr-1" /> Copiar
              </Button>
            </div>
          </div>
        )}

        {/* Links já gerados */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Links gerados</p>
          {linksQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : linksQ.isError ? (
            <p className="text-sm text-destructive">{(linksQ.error as Error)?.message}</p>
          ) : (linksQ.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum link ainda.</p>
          ) : (
            (linksQ.data || []).map((lk) => (
              <div key={lk.id} className="rounded-lg border px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">
                    {lk.itens.map((i) => `${i.quantidade}x ${nomeDoLote(i)} (${formatMoney(Number(i.preco))})`).join(' + ')}
                  </p>
                  <Badge variant="outline" className={SITUACAO[lk.situacao]?.cor}>
                    {SITUACAO[lk.situacao]?.rotulo ?? lk.situacao}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lk.nota ? `${lk.nota} · ` : ''}gerado {formatInSaoPaulo(lk.criado_em)} · vence {formatInSaoPaulo(lk.expira_em)}
                </p>
                {(lk.situacao === 'valendo' || lk.situacao === 'em_pagamento') && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => copiar(urlDoLink(lk.token))}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar link
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-700"
                      disabled={cancelar.isPending}
                      onClick={() => { if (window.confirm('Cancelar este link? Quem tiver o link não conseguirá mais pagar.')) cancelar.mutate(lk.id); }}>
                      Cancelar link
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>

      <CriarLoteEscondidoDialog
        eventId={eventId}
        open={criarLoteAberto}
        onOpenChange={setCriarLoteAberto}
        lotes={(lotesQ.data || []).filter((l) => !l.escondido && Number(l.price) > 0
          && isLotOpenForSale(l as unknown as LotForAvailability, todos))}
        onCriado={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-venda-por-link-lotes', eventId] });
          queryClient.invalidateQueries({ queryKey: ['admin-event-lots', eventId] });
        }}
      />
    </Card>
  );
};

const CriarLoteEscondidoDialog: React.FC<{
  eventId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lotes: Lote[];
  onCriado: () => void;
}> = ({ eventId, open, onOpenChange, lotes, onCriado }) => {
  const [refId, setRefId] = React.useState('');
  const [nome, setNome] = React.useState('');
  const [preco, setPreco] = React.useState('');
  const [quantidade, setQuantidade] = React.useState('1');
  const ref = lotes.find((l) => l.id === refId) ?? null;

  // Escolher o lote de referência sugere "Meia <setor>" pela metade do preço dele
  // (decisão do Gabriel: meia = metade do lote aberto). Os campos seguem editáveis.
  const escolherReferencia = (id: string) => {
    setRefId(id);
    const l = lotes.find((x) => x.id === id);
    if (!l) return;
    const setor = (l.sector_name ?? '').trim();
    setNome(setor ? `Meia ${setor}` : 'Meia');
    setPreco((Math.round(Number(l.price) * 50) / 100).toFixed(2));
  };

  React.useEffect(() => {
    if (!open) { setRefId(''); setNome(''); setPreco(''); setQuantidade('1'); }
  }, [open]);

  const valor = Number(preco.replace(',', '.'));
  const qtd = Number(quantidade);
  const invalido = !ref || !nome.trim() || !Number.isFinite(valor) || valor <= 0
    || !Number.isInteger(qtd) || qtd < 1 || qtd > 100;

  const criar = useMutation({
    mutationFn: async () => {
      if (!ref) throw new Error('Escolha o lote de referência.');
      // O lote escondido copia do lote de referência o setor e as regras de pagamento
      // (taxa, parcelas, noite), para a meia seguir o mesmo caminho da inteira.
      const novo = {
        event_id: eventId,
        name: nome.trim(),
        price: Math.round(valor * 100) / 100,
        total_quantity: qtd,
        sector_name: ref.sector_name,
        modo_taxa: ref.modo_taxa ?? 'cliente_paga',
        max_parcelas: ref.max_parcelas ?? null,
        parcelas_sem_juros: ref.parcelas_sem_juros ?? null,
        event_day_id: ref.event_day_id ?? null,
        covers_all_days: ref.covers_all_days ?? false,
        sales_start_type: 'now',
        is_active: true,
        escondido: true,
      };
      // `escondido` ainda não está nos tipos gerados (types.ts é do Lovable).
      type InsertSemTipo = { insert: (linha: typeof novo) => Promise<{ error: Error | null }> };
      const { error } = await (supabase.from('event_lots') as unknown as InsertSemTipo).insert(novo);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lote escondido criado. Agora monte o link com ele.');
      onCriado();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Não foi possível criar: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar lote escondido</DialogTitle>
          <DialogDescription>
            Não aparece na página do evento, no totem, na maquininha nem na portaria. Só é vendido
            pelo link que você gerar aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ref-lote">Lote de referência (o aberto agora)</Label>
            <select
              id="ref-lote"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={refId}
              onChange={(e) => escolherReferencia(e.target.value)}
            >
              <option value="">Escolha…</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>{nomeDoLote(l)} · {formatMoney(Number(l.price))}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Sugere o nome e a metade do preço (meia). Dá para mudar.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nome-lote">Nome (aparece no checkout, no ingresso e no e-mail)</Label>
            <Input id="nome-lote" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="preco-lote">Preço (R$)</Label>
              <Input id="preco-lote" type="number" step="0.01" min="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qtd-lote">Quantidade</Label>
              <Input id="qtd-lote" type="number" step="1" min="1" max="100" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>Voltar</Button>
          <Button onClick={() => criar.mutate()} disabled={invalido || criar.isPending}>
            {criar.isPending ? 'Criando…' : 'Criar lote escondido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
