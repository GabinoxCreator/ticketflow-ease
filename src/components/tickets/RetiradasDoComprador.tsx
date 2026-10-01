import { useQuery } from '@tanstack/react-query';
import { Package, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  lojaDb,
  NOME_DA_ENTREGA,
  type ComprovanteDeRetirada,
  type FormaDeEntrega,
} from '@/lib/loja/tipos';

interface Retirada {
  comprovante: ComprovanteDeRetirada;
  evento: string;
  itens: Array<{ rotulo: string; quantidade: number }>;
  comoRetirar: string[];
}

/**
 * Os comprovantes de retirada de quem está logado: o código que a pessoa
 * informa no balcão e o que ela comprou na loja do evento.
 *
 * Com `orderId`, mostra só o daquele pedido (tela de pagamento confirmado).
 *
 * Não renderiza nada quando não há produto, e nada quando a leitura falha:
 * a loja é um extra, e a tela de ingressos não pode cair por causa dela.
 */
export function RetiradasDoComprador({ orderId, titulo }: { orderId?: string; titulo?: string }) {
  const { data: retiradas } = useQuery({
    queryKey: ['retiradas-do-comprador', orderId ?? 'todas'],
    staleTime: 30_000,
    queryFn: async (): Promise<Retirada[]> => {
      try {
        // A RLS já devolve só os comprovantes dos pedidos de quem está logado.
        let q = lojaDb
          .from('product_claims')
          .select('id, order_id, event_id, claim_code, status, picked_up_at, picked_up_by_name, created_at')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });
        if (orderId) q = q.eq('order_id', orderId);
        const { data: claims, error } = await q;
        if (error || !claims || claims.length === 0) return [];

        const orderIds = claims.map((c: ComprovanteDeRetirada) => c.order_id);
        const eventIds = Array.from(new Set(claims.map((c: ComprovanteDeRetirada) => c.event_id))) as string[];

        const [{ data: linhas }, { data: eventos }] = await Promise.all([
          lojaDb.from('order_product_items')
            .select('order_id, event_product_id, quantity, label_snapshot, stock_state')
            .in('order_id', orderIds)
            .eq('stock_state', 'sold'),
          supabase.from('events').select('id, title').in('id', eventIds),
        ]);

        const epIds = Array.from(new Set((linhas ?? []).map((l: any) => l.event_product_id)));
        const { data: ativacoes } = epIds.length
          ? await lojaDb.from('event_products').select('id, fulfillment, fulfillment_info').in('id', epIds)
          : { data: [] };

        return claims.map((c: ComprovanteDeRetirada) => {
          const doPedido = (linhas ?? []).filter((l: any) => l.order_id === c.order_id);
          const porRotulo = new Map<string, number>();
          for (const l of doPedido) {
            const rotulo = l.label_snapshot || 'Produto';
            porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0) + Number(l.quantity || 0));
          }
          const comoRetirar = Array.from(new Set(
            (ativacoes ?? [])
              .filter((a: any) => doPedido.some((l: any) => l.event_product_id === a.id))
              .map((a: any) => {
                const forma = a.fulfillment ? NOME_DA_ENTREGA[a.fulfillment as FormaDeEntrega] : '';
                const info = (a.fulfillment_info ?? '').trim();
                return [forma, info].filter(Boolean).join(': ');
              })
              .filter(Boolean),
          )) as string[];
          return {
            comprovante: c,
            evento: (eventos ?? []).find((e) => e.id === c.event_id)?.title ?? '',
            itens: [...porRotulo.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade })),
            comoRetirar,
          };
        }).filter((r: Retirada) => r.itens.length > 0);
      } catch {
        return [];
      }
    },
  });

  if (!retiradas || retiradas.length === 0) return null;

  return (
    <section className="space-y-3 text-left">
      {titulo && <h2 className="font-display font-bold text-lg">{titulo}</h2>}
      {retiradas.map((r) => {
        const retirado = r.comprovante.status === 'picked_up';
        return (
          <div
            key={r.comprovante.id}
            className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Produtos
                </p>
                {r.evento && <p className="font-semibold truncate">{r.evento}</p>}
              </div>
              {retirado ? (
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> Retirado
                </Badge>
              ) : (
                <Badge className="shrink-0">Aguardando retirada</Badge>
              )}
            </div>

            <ul className="text-sm space-y-1">
              {r.itens.map((i) => (
                <li key={i.rotulo}>{i.quantidade}x {i.rotulo}</li>
              ))}
            </ul>

            {!retirado && (
              <div className="rounded-xl bg-background/60 border border-border/60 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Código de retirada</p>
                <p className="font-mono font-bold text-2xl tracking-[0.2em]">{r.comprovante.claim_code}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Informe este código para retirar.</p>
              </div>
            )}

            {r.comoRetirar.map((c) => (
              <p key={c} className="text-xs text-muted-foreground">{c}</p>
            ))}
          </div>
        );
      })}
    </section>
  );
}
