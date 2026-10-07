import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, CreditCard, ExternalLink, Loader2, Paperclip, Undo2 } from 'lucide-react';

/*
 * A fila de reembolsos da casa (OS-103, 02/10/2026).
 *
 * O comprador pede em Meus Ingressos; aqui a casa APROVA (é a aprovação que
 * cancela o ingresso e devolve a vaga), paga por fora e dá baixa. O sistema
 * não movimenta dinheiro: PIX é pago na chave mostrada aqui, e compra no
 * cartão é estornada no cartão (decisão do Gabriel: devolver por PIX uma
 * compra de cartão deixa a pessoa contestar depois e receber duas vezes).
 *
 * A tela só mostra o que o banco calculou: regra, valores e saldo do produtor
 * vêm de `admin_reembolsos_listar`.
 */

type Status = 'solicitado' | 'aprovado' | 'pago' | 'recusado' | 'desistido';

interface IngressoDoPedido {
  ticket_id: string;
  codigo: string;
  titular: string | null;
  nome: string;
  status: string;
  valor_ingresso: number;
  valor_taxa: number;
}

interface Reembolso {
  id: string;
  numero: number;
  status: Status;
  order_id: string;
  comprador: string | null;
  comprador_cpf: string | null;
  comprador_email: string | null;
  comprador_telefone: string | null;
  evento: string | null;
  data_do_evento: string | null;
  hora_do_evento: string | null;
  forma: 'pix' | 'cartao';
  chave_pix: string | null;
  tipo_chave_pix: string | null;
  payment_method: string | null;
  provider_transaction_id: string | null;
  mp_payment_id: string | null;
  total_pago: number;
  comprado_em: string;
  valor_ingressos: number;
  valor_taxa: number;
  devolve_taxa: boolean;
  valor_a_devolver: number;
  regra: { janela?: string; versao_aceita?: string; limite?: string } | null;
  motivo: string | null;
  solicitado_em: string;
  decidido_em: string | null;
  motivo_recusa: string | null;
  modo_cancelamento: string | null;
  pago_em: string | null;
  observacao_pagamento: string | null;
  comprovante_path: string | null;
  ingressos: IngressoDoPedido[];
  ingressos_do_pedido: number;
  saldo_do_produtor: number | null;
}

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (n: number | null | undefined) => moneyFmt.format(Number(n ?? 0));

function dataBR(value: string | null | undefined, comHora = false) {
  if (!value) return '?';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (!comHora) return dia;
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

/** "há 3 dias", "há 5 horas": pedido parado é dinheiro e vaga presos. */
function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `há ${d} dias`;
}

function diasAte(ymd: string | null) {
  if (!ymd) return null;
  const alvo = new Date(`${ymd}T12:00:00-03:00`).getTime();
  return isNaN(alvo) ? null : Math.round((alvo - Date.now()) / 86_400_000);
}

const ROTULO_CHAVE: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Celular', aleatoria: 'Chave aleatória',
};

function fraseDoErro(payload: any): string {
  const err = payload?.error;
  if (err === 'invalid_status') return 'Este pedido já foi respondido por outra pessoa. Atualize a página.';
  if (err === 'reembolso_nao_encontrado') return 'Pedido de reembolso não encontrado.';
  if (err === 'motivo_obrigatorio') return 'Escreva o motivo da recusa: o comprador vai ler.';
  return 'Não foi possível concluir. Tente novamente.';
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 120);
}

type TabKey = 'solicitado' | 'aprovado' | 'pago' | 'all';

function useReembolsos(tab: TabKey) {
  return useQuery({
    queryKey: ['admin-reembolsos', tab],
    queryFn: async () => {
      // `as any`: o types.ts só conhece a função depois que a migration subir.
      const { data, error } = await (supabase.rpc as any)('admin_reembolsos_listar', {
        p_status: tab === 'all' ? null : tab,
      });
      if (error) throw error;
      return (data ?? []) as Reembolso[];
    },
    staleTime: 15_000,
  });
}

const AdminReembolsos: React.FC = () => {
  // `?pedido=1001` abre direto naquele pedido. É o caminho do botão da gestão:
  // lá o João vê a fila, e a baixa e o comprovante são dados aqui, porque a
  // gestão só lê o banco do site (decisão do Gabriel, 02/10).
  const [params, setParams] = useSearchParams();
  const pedido = Number(params.get('pedido')) || null;
  const [tab, setTab] = useState<TabKey>(pedido ? 'all' : 'solicitado');

  const analisarQ = useReembolsos('solicitado');
  const pagarQ = useReembolsos('aprovado');
  const pagosQ = useReembolsos('pago');
  const todosQ = useReembolsos('all');

  return (
    <AdminLayout title="Reembolsos">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Reembolsos</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos feitos pelo comprador em Meus Ingressos. Aprovar cancela o ingresso e devolve a vaga; o
            pagamento é feito por fora e a baixa é dada aqui.
          </p>
        </div>

        {pedido && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            Mostrando só o pedido nº {pedido}.
            <Button size="sm" variant="outline" onClick={() => { setParams({}); setTab('solicitado'); }}>Ver a fila inteira</Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="solicitado" className="gap-2">
              Para analisar
              <Badge variant="secondary">{analisarQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="aprovado" className="gap-2">
              Para pagar
              <Badge variant="secondary">{pagarQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pago" className="gap-2">
              Pagos
              <Badge variant="secondary">{pagosQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              Todos
              <Badge variant="secondary">{todosQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="solicitado"><Lista query={analisarQ} pedido={pedido} vazio="Nenhum pedido esperando análise." /></TabsContent>
          <TabsContent value="aprovado"><Lista query={pagarQ} pedido={pedido} vazio="Nenhum reembolso esperando pagamento." /></TabsContent>
          <TabsContent value="pago"><Lista query={pagosQ} pedido={pedido} vazio="Nenhum reembolso pago ainda." /></TabsContent>
          <TabsContent value="all"><Lista query={todosQ} pedido={pedido} vazio="Nenhum pedido de reembolso ainda." /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

interface QueryShape {
  data: Reembolso[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

function Lista({ query, vazio, pedido }: { query: QueryShape; vazio: string; pedido: number | null }) {
  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </CardContent>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">
          Não foi possível carregar os reembolsos.
        </CardContent>
      </Card>
    );
  }
  const rows = (query.data ?? []).filter((r) => !pedido || r.numero === pedido);
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Undo2 className="h-10 w-10 mb-3 text-orange-500/50" />
          <p>{vazio}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => <CartaoDoReembolso key={r.id} r={r} />)}
    </div>
  );
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          toast.error('Não consegui copiar. Selecione o texto e copie manualmente.');
        }
      }}
    >
      {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiado ? 'Copiado' : rotulo}
    </Button>
  );
}

function SeloDoStatus({ status }: { status: Status }) {
  if (status === 'solicitado') return <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/40 border">Para analisar</Badge>;
  if (status === 'aprovado') return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/40 border">Aprovado, falta pagar</Badge>;
  if (status === 'pago') return <Badge className="bg-green-500/20 text-green-700 border-green-500/40 border">Pago</Badge>;
  if (status === 'recusado') return <Badge variant="secondary">Recusado</Badge>;
  return <Badge variant="secondary">O comprador desistiu</Badge>;
}

function CartaoDoReembolso({ r }: { r: Reembolso }) {
  const qc = useQueryClient();
  const [aprovarAberto, setAprovarAberto] = useState(false);
  const [recusarAberto, setRecusarAberto] = useState(false);
  const [pagarAberto, setPagarAberto] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [observacao, setObservacao] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: ['admin-reembolsos'] });

  function useAcao(fn: string, args: () => Record<string, unknown>, sucesso: string, aoTerminar: () => void) {
    return useMutation({
      mutationFn: async () => {
        const { data, error } = await (supabase.rpc as any)(fn, args());
        if (error) throw error;
        return data as any;
      },
      onSuccess: (data) => {
        if (data?.ok) {
          toast.success(sucesso);
          aoTerminar();
          recarregar();
        } else {
          toast.error(fraseDoErro(data));
        }
      },
      onError: () => toast.error('Não foi possível concluir. Tente novamente.'),
    });
  }

  const aprovar = useAcao('admin_reembolso_aprovar', () => ({ p_reembolso_id: r.id }),
    'Reembolso aprovado. Ingressos cancelados e vaga devolvida.', () => setAprovarAberto(false));
  const recusar = useAcao('admin_reembolso_recusar', () => ({ p_reembolso_id: r.id, p_motivo: motivoRecusa }),
    'Pedido recusado. Os ingressos voltaram a valer.', () => setRecusarAberto(false));
  const pagar = useAcao('admin_reembolso_marcar_pago', () => ({ p_reembolso_id: r.id, p_observacao: observacao || null }),
    'Reembolso marcado como pago.', () => setPagarAberto(false));

  const anexar = useMutation({
    mutationFn: async (file: File) => {
      // Mesmo cofre dos comprovantes de repasse (só admin lê e grava), em pasta própria.
      const path = `reembolsos/${r.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const up = await supabase.storage
        .from('payout-proofs')
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (up.error) throw up.error;
      const { data, error } = await (supabase.rpc as any)('admin_reembolso_anexar_comprovante', {
        p_reembolso_id: r.id,
        p_path: path,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      if (data?.ok) { toast.success('Comprovante anexado'); recarregar(); }
      else toast.error('Não foi possível concluir. Tente novamente.');
    },
    onError: () => toast.error('Não foi possível concluir. Tente novamente.'),
  });

  async function verComprovante() {
    if (!r.comprovante_path) return;
    const { data, error } = await supabase.storage.from('payout-proofs').createSignedUrl(r.comprovante_path, 60);
    if (error || !data?.signedUrl) { toast.error('Não foi possível abrir o comprovante.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const faltam = diasAte(r.data_do_evento);
  const quandoEvento =
    faltam === null ? dataBR(r.data_do_evento)
    : faltam > 0 ? `${dataBR(r.data_do_evento)}, faltam ${faltam} dia${faltam === 1 ? '' : 's'}`
    : faltam === 0 ? `${dataBR(r.data_do_evento)}, é HOJE`
    : `${dataBR(r.data_do_evento)}, já aconteceu`;

  const n = r.ingressos.length;
  const quantos = n === r.ingressos_do_pedido
    ? (n === 1 ? 'O ingresso da compra' : `Os ${n} ingressos da compra`)
    : `${n} de ${r.ingressos_do_pedido} ingressos da compra`;

  const janela = r.regra?.janela === 'arrependimento'
    ? 'Desistência dentro dos 7 dias da compra'
    : r.devolve_taxa
      ? 'Pedido até 48h antes do evento, dentro dos 7 dias da compra'
      : 'Fora dos 7 dias, pedido até 48h antes do evento';

  const telefone = (r.comprador_telefone ?? '').replace(/\D/g, '');
  const transacao = r.provider_transaction_id || r.mp_payment_id;
  const devendo = r.saldo_do_produtor !== null && Number(r.saldo_do_produtor) < 0;
  const aberto = r.status === 'solicitado' || r.status === 'aprovado';

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Cabeçalho: quem, quanto, há quanto tempo */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold">Pedido nº {r.numero}</span>
              <SeloDoStatus status={r.status} />
              {aberto && <span className="text-xs text-muted-foreground">pedido {haQuanto(r.solicitado_em)}</span>}
            </div>
            <div className="mt-1 font-medium truncate">{r.comprador ?? 'Comprador sem nome'}</div>
            <div className="text-xs text-muted-foreground">
              {[r.comprador_cpf && `CPF ${r.comprador_cpf}`, r.comprador_email].filter(Boolean).join(' · ')}
              {telefone && (
                <>
                  {' · '}
                  <a className="underline underline-offset-2" href={`https://wa.me/55${telefone}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp {r.comprador_telefone}
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Devolver</div>
            <div className="font-display text-2xl font-bold">{brl(r.valor_a_devolver)}</div>
          </div>
        </div>

        {devendo && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              O produtor já recebeu este dinheiro. O evento fica devendo{' '}
              <strong>{brl(Math.abs(Number(r.saldo_do_produtor)))}</strong> para a casa.
            </span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* O que está sendo devolvido */}
          <div className="space-y-2 text-sm">
            <div>
              <div className="font-medium">{r.evento ?? 'Evento não identificado'}</div>
              <div className="text-xs text-muted-foreground">{quandoEvento}</div>
            </div>
            <div className="rounded-lg border border-border/60 divide-y divide-border/60">
              <div className="px-3 py-1.5 text-xs text-muted-foreground">{quantos}</div>
              {r.ingressos.map((i) => (
                <div key={i.ticket_id} className="px-3 py-1.5 flex justify-between gap-3">
                  <span className="truncate">{i.nome} · <span className="font-mono text-xs">{i.codigo}</span></span>
                  <span className="shrink-0">{brl(i.valor_ingresso)}</span>
                </div>
              ))}
            </div>
            {r.motivo && (
              <p className="text-xs text-muted-foreground">
                O comprador escreveu: <span className="text-foreground">{r.motivo}</span>
              </p>
            )}
          </div>

          {/* A regra aplicada e por onde o dinheiro volta */}
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1">
              <div className="text-xs text-muted-foreground">Regra aplicada pelo sistema</div>
              <div>{janela}.</div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Ingressos</span><span>{brl(r.valor_ingressos)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Taxa de serviço</span>
                <span>{r.devolve_taxa ? `${brl(r.valor_taxa)} (volta: desistiu nos 7 dias da compra)` : `${brl(r.valor_taxa)} (não volta)`}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Comprado em {dataBR(r.comprado_em, true)} · total pago {brl(r.total_pago)}
              </div>
            </div>

            {r.forma === 'pix' ? (
              <div className="rounded-lg border border-border/60 px-3 py-2.5 space-y-2">
                <div className="text-xs text-muted-foreground">Devolver por PIX</div>
                <div className="font-medium break-all">
                  {ROTULO_CHAVE[r.tipo_chave_pix ?? ''] ?? 'Chave'}: {r.chave_pix}
                </div>
                {aberto && (
                  <div className="flex flex-wrap gap-2">
                    <Copiar texto={r.chave_pix ?? ''} rotulo="Copiar chave" />
                    <Copiar texto={Number(r.valor_a_devolver).toFixed(2).replace('.', ',')} rotulo="Copiar valor" />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" /> Compra no cartão: estornar no cartão (Marcel), não por PIX
                </div>
                {transacao ? (
                  <>
                    <div className="font-medium break-all">Transação {transacao}</div>
                    {aberto && (
                      <div className="flex flex-wrap gap-2">
                        <Copiar texto={String(transacao)} rotulo="Copiar transação" />
                        <Copiar texto={Number(r.valor_a_devolver).toFixed(2).replace('.', ',')} rotulo="Copiar valor" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">Sem número de transação gravado neste pedido.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ações */}
        {r.status === 'solicitado' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setAprovarAberto(true)} disabled={aprovar.isPending}>Aprovar</Button>
            <Button variant="outline" onClick={() => setRecusarAberto(true)} disabled={recusar.isPending}>Recusar</Button>
          </div>
        )}

        {r.status === 'aprovado' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => setPagarAberto(true)} disabled={pagar.isPending}>Marcar como pago</Button>
            <span className="text-xs text-muted-foreground">Aprovado em {dataBR(r.decidido_em, true)}</span>
          </div>
        )}

        {r.status === 'pago' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
            <span>Pago em {dataBR(r.pago_em, true)}</span>
            {r.observacao_pagamento && <span className="text-muted-foreground">· {r.observacao_pagamento}</span>}
            {r.comprovante_path ? (
              <>
                <Badge className="bg-green-500/20 text-green-700 border-green-500/40 border">Comprovante anexado</Badge>
                <Button size="sm" variant="outline" onClick={verComprovante}><ExternalLink className="h-3 w-3" /> Ver</Button>
              </>
            ) : (
              <>
                <Badge variant="secondary">Sem comprovante</Badge>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) anexar.mutate(f);
                    e.target.value = '';
                  }}
                />
                <Button size="sm" variant="outline" disabled={anexar.isPending} onClick={() => fileRef.current?.click()}>
                  {anexar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                  {anexar.isPending ? 'Enviando…' : 'Anexar comprovante'}
                </Button>
              </>
            )}
          </div>
        )}

        {r.status === 'recusado' && (
          <p className="text-sm text-muted-foreground">
            Recusado em {dataBR(r.decidido_em, true)}. Motivo que o comprador leu:{' '}
            <span className="text-foreground">{r.motivo_recusa}</span>
          </p>
        )}

        {/* Aprovar */}
        <AlertDialog open={aprovarAberto} onOpenChange={setAprovarAberto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aprovar o reembolso nº {r.numero}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>
                    {n === 1 ? 'O ingresso é cancelado' : `Os ${n} ingressos são cancelados`} agora e a vaga volta para a
                    venda. <strong>Não tem volta.</strong>
                  </div>
                  <div>
                    Depois é pagar <strong>{brl(r.valor_a_devolver)}</strong>{' '}
                    {r.forma === 'pix' ? 'por PIX' : 'por estorno no cartão'} e dar baixa aqui.
                  </div>
                  {devendo && (
                    <div className="text-destructive">
                      Atenção: o produtor já recebeu este dinheiro.
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={aprovar.isPending}>Voltar</AlertDialogCancel>
              <AlertDialogAction disabled={aprovar.isPending} onClick={(e) => { e.preventDefault(); aprovar.mutate(); }}>
                {aprovar.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Aprovar e cancelar {n === 1 ? 'o ingresso' : 'os ingressos'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Recusar */}
        <Dialog open={recusarAberto} onOpenChange={setRecusarAberto}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Recusar o reembolso nº {r.numero}</DialogTitle>
              <DialogDescription>
                Os ingressos voltam a valer. O comprador lê este motivo em Meus Ingressos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`motivo-${r.id}`}>Motivo da recusa</Label>
              <Textarea
                id={`motivo-${r.id}`}
                rows={3}
                maxLength={500}
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                placeholder="Escreva como se estivesse respondendo para o comprador."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecusarAberto(false)} disabled={recusar.isPending}>Voltar</Button>
              <Button onClick={() => recusar.mutate()} disabled={recusar.isPending || motivoRecusa.trim().length < 5}>
                {recusar.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Recusar pedido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dar baixa */}
        <AlertDialog open={pagarAberto} onOpenChange={setPagarAberto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar que o reembolso foi pago</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <div>
                    Valor: <span className="font-display font-semibold">{brl(r.valor_a_devolver)}</span>
                    {r.forma === 'pix'
                      ? <> · PIX para {ROTULO_CHAVE[r.tipo_chave_pix ?? ''] ?? 'chave'} {r.chave_pix}</>
                      : <> · estorno no cartão</>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`obs-${r.id}`}>Anotação (opcional)</Label>
                    <Input
                      id={`obs-${r.id}`}
                      value={observacao}
                      maxLength={200}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Ex.: PIX pago pelo João em 02/10"
                    />
                  </div>
                  <div className="text-muted-foreground">
                    O sistema não paga nada: só registra que você já pagou.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pagar.isPending}>Voltar</AlertDialogCancel>
              <AlertDialogAction disabled={pagar.isPending} onClick={(e) => { e.preventDefault(); pagar.mutate(); }}>
                {pagar.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Já paguei, dar baixa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default AdminReembolsos;
