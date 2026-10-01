import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, PackageCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvalidarLoja, useRetiradasDoEvento } from '@/hooks/useLojaDoEvento';
import {
  lojaDb,
  mascararCpf,
  type ComprovanteDeRetirada,
  type ItemDeProdutoDoPedido,
  type ProdutoNoEventoCompleto,
} from '@/lib/loja/tipos';
import { cn } from '@/lib/utils';

const NOME_DO_COMPROVANTE: Record<ComprovanteDeRetirada['status'], string> = {
  pending: 'Aguardando retirada',
  picked_up: 'Retirado',
  cancelled: 'Cancelado',
};

const CORES_DO_COMPROVANTE: Record<ComprovanteDeRetirada['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  picked_up: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const dataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

interface RespostaDaBaixa {
  ok: boolean;
  motivo?: 'nao_encontrado' | 'cancelado' | 'ja_retirado';
  quando?: string | null;
  por?: string | null;
}

interface Props {
  eventId: string;
  produtos: ProdutoNoEventoCompleto[];
}

export function RetiradasDoEvento({ eventId, produtos }: Props) {
  const { data, isLoading } = useRetiradasDoEvento(eventId, produtos.map((p) => p.id));
  const invalidar = useInvalidarLoja(eventId);
  const [codigo, setCodigo] = useState('');
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const comprovantes = data?.comprovantes ?? [];
  const itens = useMemo(() => data?.itens ?? [], [data]);

  const itensPorPedido = useMemo(() => {
    const mapa = new Map<string, ItemDeProdutoDoPedido[]>();
    for (const i of itens) {
      mapa.set(i.order_id, [...(mapa.get(i.order_id) ?? []), i]);
    }
    return mapa;
  }, [itens]);

  // O que mandar fazer: só o que está vendido de verdade, somado por rótulo
  // ("Camiseta branca · G").
  const vendidos = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of itens) {
      if (i.stock_state !== 'sold') continue;
      const rotulo = i.label_snapshot?.trim() || 'Produto sem nome';
      mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + i.quantity);
    }
    return Array.from(mapa, ([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    );
  }, [itens]);
  const totalVendido = vendidos.reduce((n, v) => n + v.quantidade, 0);

  const resumoDoPedido = (orderId: string) =>
    (itensPorPedido.get(orderId) ?? []).map((i) => `${i.quantity} × ${i.label_snapshot?.trim() || 'Produto'}`).join(', ');

  const darBaixa = useMutation({
    mutationFn: async (claimCode: string): Promise<{ resposta: RespostaDaBaixa; claimCode: string }> => {
      const { data: resposta, error } = await lojaDb.rpc('retirar_produto', {
        _claim_code: claimCode,
        _event_id: eventId,
      });
      if (error) throw error;
      return { resposta: (resposta ?? { ok: false }) as RespostaDaBaixa, claimCode };
    },
    onSuccess: ({ resposta, claimCode }) => {
      invalidar();
      if (resposta.ok) {
        const texto = `Baixa feita no código ${claimCode}. Pode entregar.`;
        setAviso({ tipo: 'ok', texto });
        toast.success(texto);
        setCodigo('');
        return;
      }
      let texto = 'Não foi possível dar baixa neste código.';
      if (resposta.motivo === 'nao_encontrado') {
        texto = `Código ${claimCode} não encontrado neste evento. Confira se foi digitado certo.`;
      } else if (resposta.motivo === 'cancelado') {
        texto = `O código ${claimCode} está cancelado: o pedido foi cancelado ou reembolsado. Não entregue.`;
      } else if (resposta.motivo === 'ja_retirado') {
        texto = `O código ${claimCode} já foi retirado` +
          (resposta.quando ? ` em ${dataHora(resposta.quando)}` : '') +
          (resposta.por ? `, entregue por ${resposta.por}` : '') +
          '. Não entregue de novo.';
      }
      setAviso({ tipo: 'erro', texto });
      toast.error(texto);
    },
    onError: (e: Error & { code?: string }) => {
      const texto = e?.code === '42501'
        ? 'Você não tem permissão para dar baixa neste evento.'
        : 'Erro ao dar baixa: ' + (e?.message ?? 'tente de novo');
      setAviso({ tipo: 'erro', texto });
      toast.error(texto);
    },
  });

  const enviarCodigo = () => {
    const limpo = codigo.trim().toUpperCase();
    if (!limpo) return;
    darBaixa.mutate(limpo);
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? comprovantes.filter(
        (c) =>
          c.claim_code.toLowerCase().includes(termo) ||
          (c.order?.customer_name ?? '').toLowerCase().includes(termo),
      )
    : comprovantes;
  const retirados = comprovantes.filter((c) => c.status === 'picked_up').length;
  const aguardando = comprovantes.filter((c) => c.status === 'pending').length;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-bold">Retiradas</h3>
        <p className="text-sm text-muted-foreground">
          O que já foi vendido e a baixa de cada pedido na hora da entrega.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {/* O que foi vendido */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">O que foi vendido</p>
              <Badge variant="secondary">{totalVendido} no total</Badge>
            </div>
            {vendidos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum produto vendido ainda.</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
                {vendidos.map((v) => (
                  <li key={v.rotulo} className="flex items-center justify-between gap-3 border-b border-border/40 py-1">
                    <span className="min-w-0 truncate">{v.rotulo}</span>
                    <span className="font-mono font-bold shrink-0">{v.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Conta só pedido pago. Pedido cancelado ou reembolsado sai daqui sozinho.
            </p>
          </div>

          {/* Dar baixa */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <p className="font-semibold">Dar baixa pelo código de retirada</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') enviarCodigo();
                }}
                placeholder="Código do comprador, ex: K7MQ2XPA"
                className="font-mono tracking-widest sm:max-w-xs"
                maxLength={16}
                autoComplete="off"
              />
              <Button variant="hero" disabled={!codigo.trim() || darBaixa.isPending} onClick={enviarCodigo}>
                <PackageCheck className="w-4 h-4 mr-2" />
                {darBaixa.isPending ? 'Conferindo...' : 'Dar baixa'}
              </Button>
            </div>
            {aviso && (
              <p
                className={cn(
                  'rounded-lg border p-3 text-sm font-medium',
                  aviso.tipo === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-destructive/30 bg-destructive/10 text-destructive',
                )}
              >
                {aviso.texto}
              </p>
            )}
          </div>

          {/* Comprovantes */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="font-semibold">
                Comprovantes
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {retirados} retirados · {aguardando} aguardando
                </span>
              </p>
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou código"
                  className="pl-9"
                />
              </div>
            </div>

            {comprovantes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <PackageCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-semibold">Nenhum comprovante ainda</p>
                <p className="text-sm text-muted-foreground">
                  Cada pedido pago com produto gera um código de retirada, que aparece aqui.
                </p>
              </div>
            ) : filtrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum comprovante encontrado nessa busca.</p>
            ) : (
              <div className="grid gap-3">
                {filtrados.map((c) => {
                  const cpf = mascararCpf(c.order?.customer_cpf);
                  return (
                    <div key={c.id} className="rounded-xl border border-border bg-card/50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold tracking-widest">{c.claim_code}</span>
                          <Badge variant="outline" className={cn('text-xs', CORES_DO_COMPROVANTE[c.status])}>
                            {NOME_DO_COMPROVANTE[c.status] ?? c.status}
                          </Badge>
                        </div>
                        <p className="text-sm">
                          {c.order?.customer_name || 'Comprador sem nome'}
                          {cpf && <span className="text-muted-foreground"> · CPF {cpf}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {resumoDoPedido(c.order_id) || 'Itens não encontrados'}
                        </p>
                        {c.status === 'picked_up' && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Retirado em {dataHora(c.picked_up_at)}
                            {c.picked_up_by_name ? `, entregue por ${c.picked_up_by_name}` : ''}
                          </p>
                        )}
                      </div>
                      {c.status === 'pending' && (
                        <Button
                          variant="outline"
                          className="shrink-0"
                          disabled={darBaixa.isPending}
                          onClick={() => darBaixa.mutate(c.claim_code)}
                        >
                          <PackageCheck className="w-4 h-4 mr-2" />
                          Dar baixa
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
