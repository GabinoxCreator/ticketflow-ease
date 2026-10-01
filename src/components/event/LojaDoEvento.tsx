import { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Minus, Plus, Package, ShoppingBag, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { disponivel, nomeDoProduto, NOME_DA_ENTREGA } from '@/lib/loja/tipos';
import { chaveDoCombo, chaveDoProduto, type ItemDoCarrinho } from '@/lib/loja/carrinho';
import {
  estoqueDoTamanho,
  type ComboDaVitrine,
  type VitrineDaLoja as Loja,
  type ProdutoDaVitrine,
} from '@/hooks/useVitrineDaLoja';

/** Teto por linha do carrinho, igual ao dos ingressos. O servidor tem o dele. */
const MAX_POR_LINHA = 10;

interface LoteAberto {
  id: string;
  name: string;
  modo_taxa?: string | null;
}

interface Props {
  loja: Loja;
  /** Lotes que estão à venda agora. Combo com ingresso só aparece se o lote dele está aqui. */
  lotesAbertos: LoteAberto[];
  /** Linhas de produto e combo que já estão no carrinho. */
  itens: ItemDoCarrinho[];
  onAdicionar: (item: ItemDoCarrinho) => void;
  onMudar: (chave: string, delta: number) => void;
  formatPrice: (v: number) => string;
}

function SeletorDeTamanho({
  produto, escolhido, onEscolher,
}: {
  produto: ProdutoDaVitrine;
  escolhido: string | null;
  onEscolher: (variantId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Tamanho de ${nomeDoProduto(produto.produto)}`}>
      {produto.tamanhos.map((t) => {
        const estoque = estoqueDoTamanho(produto, t.id);
        const acabou = !estoque || disponivel(estoque) === 0;
        const ativo = escolhido === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={acabou}
            onClick={() => onEscolher(t.id)}
            className={cn(
              'min-w-10 h-9 px-2.5 rounded-lg border text-sm font-semibold transition-colors',
              acabou && 'opacity-40 line-through cursor-not-allowed border-border/40',
              !acabou && !ativo && 'border-border/60 bg-background/60 hover:border-primary/50',
              ativo && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function CartaoDeProduto({
  p, itens, onAdicionar, onMudar, formatPrice,
}: { p: ProdutoDaVitrine } & Pick<Props, 'itens' | 'onAdicionar' | 'onMudar' | 'formatPrice'>) {
  const temTamanho = p.tamanhos.length > 0;
  const [tamanho, setTamanho] = useState<string | null>(null);
  const nome = nomeDoProduto(p.produto);
  const preco = Number(p.ativacao.price ?? 0);

  const variantId = temTamanho ? tamanho : null;
  const chave = chaveDoProduto(p.ativacao.id, variantId);
  const noCarrinho = itens.find((i) => i.lotId === chave)?.quantity ?? 0;
  const estoque = estoqueDoTamanho(p, variantId);
  const resta = estoque ? disponivel(estoque) : 0;
  // Esgotado de verdade: nenhum tamanho (ou a linha única) tem unidade.
  const esgotado = p.estoques.every((s) => disponivel(s) === 0);
  const totalNoCarrinho = itens
    .filter((i) => i.eventProductId === p.ativacao.id && i.tipo === 'product')
    .reduce((s, i) => s + i.quantity, 0);

  const somar = () => {
    if (temTamanho && !tamanho) {
      toast.error('Escolha o tamanho primeiro');
      return;
    }
    if (noCarrinho >= Math.min(MAX_POR_LINHA, resta)) {
      toast.error(resta <= noCarrinho ? 'Não há mais unidades disponíveis' : `Máximo de ${MAX_POR_LINHA} por pedido`);
      return;
    }
    if (noCarrinho > 0) {
      onMudar(chave, 1);
      return;
    }
    const rotulo = temTamanho ? p.tamanhos.find((t) => t.id === tamanho)?.label : null;
    onAdicionar({
      lotId: chave,
      lotName: rotulo ? `${nome} · ${rotulo}` : nome,
      quantity: 1,
      price: preco,
      modoTaxa: p.ativacao.modo_taxa === 'absorve' ? 'absorve' : null,
      tipo: 'product',
      eventProductId: p.ativacao.id,
      variantId,
    });
  };

  return (
    <div className={cn('px-5 md:px-6 py-5 transition-colors', esgotado && 'opacity-50', totalNoCarrinho > 0 && 'bg-primary/5')}>
      <div className="flex gap-4">
        <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
          {p.produto.image_url
            ? <img src={p.produto.image_url} alt={nome} className="w-full h-full object-cover" loading="lazy" />
            : <Package className="w-8 h-8 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-base text-foreground">{nome}</h4>
            {esgotado && <Badge variant="secondary" className="text-xs">Esgotado</Badge>}
            {p.ativacao.modo_taxa === 'absorve' && !esgotado && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-400">
                <BadgeCheck className="w-3 h-3" /> Sem taxa
              </span>
            )}
          </div>
          {p.produto.description && (
            <p className="text-xs text-muted-foreground">{p.produto.description}</p>
          )}
          <p className="font-bold text-2xl text-foreground">{formatPrice(preco)}</p>

          {!esgotado && temTamanho && (
            <SeletorDeTamanho produto={p} escolhido={tamanho} onEscolher={setTamanho} />
          )}

          {!esgotado && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {p.ativacao.fulfillment ? NOME_DA_ENTREGA[p.ativacao.fulfillment] : null}
                {p.ativacao.fulfillment_info ? `: ${p.ativacao.fulfillment_info}` : null}
              </p>
              <div
                className={cn(
                  'flex items-center gap-1 shrink-0 rounded-full bg-background/40 backdrop-blur-sm border px-1.5 py-1.5 transition-colors',
                  noCarrinho > 0 ? 'border-primary/50' : 'border-border/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => onMudar(chave, -1)}
                  aria-label={`Remover um ${nome}`}
                  disabled={noCarrinho === 0}
                  className={cn(
                    'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
                    noCarrinho === 0
                      ? 'border-border/40 text-muted-foreground/50 cursor-not-allowed'
                      : 'border-border/60 bg-background/60 text-foreground hover:bg-primary/20 hover:border-primary/50',
                  )}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className={cn('w-8 text-center text-lg font-semibold tabular-nums', noCarrinho > 0 ? 'text-primary' : 'text-muted-foreground')}>
                  {noCarrinho}
                </span>
                <button
                  type="button"
                  onClick={somar}
                  aria-label={`Adicionar um ${nome}`}
                  className="w-10 h-10 rounded-full border border-primary/60 bg-primary text-primary-foreground flex items-center justify-center transition-all hover:opacity-90"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoDeCombo({
  c, loja, lotesAbertos, itens, onAdicionar, onMudar, formatPrice,
}: { c: ComboDaVitrine } & Props) {
  const partesDeProduto = c.itens.filter((i) => i.kind === 'product');
  const [escolhas, setEscolhas] = useState<Record<string, string | null>>({});

  const produtoDe = (eventProductId: string | null) =>
    loja.produtos.find((p) => p.ativacao.id === eventProductId) ?? null;

  const faltaTamanho = partesDeProduto.some((i) => {
    const p = produtoDe(i.event_product_id);
    return p && p.tamanhos.length > 0 && !escolhas[i.event_product_id!];
  });

  const escolhasCompletas: Record<string, string | null> = {};
  for (const i of partesDeProduto) escolhasCompletas[i.event_product_id!] = escolhas[i.event_product_id!] ?? null;
  const chave = chaveDoCombo(c.combo.id, escolhasCompletas);
  const noCarrinho = itens.find((i) => i.lotId === chave)?.quantity ?? 0;
  const totalNoCarrinho = itens.filter((i) => i.bundleId === c.combo.id).reduce((s, i) => s + i.quantity, 0);

  // Parte do combo que entra na base da taxa: a mesma conta do servidor, linha
  // a linha, para a tela não prometer um total diferente do que será cobrado.
  const baseDaTaxaUnit = c.itens.reduce((s, i) => {
    const absorve = i.kind === 'lot'
      ? lotesAbertos.find((l) => l.id === i.lot_id)?.modo_taxa === 'absorve'
      : produtoDe(i.event_product_id)?.ativacao.modo_taxa === 'absorve';
    return absorve ? s : s + Number(i.unit_face_share) * i.quantity;
  }, 0);

  const adicionar = () => {
    if (faltaTamanho) {
      toast.error('Escolha o tamanho primeiro');
      return;
    }
    if (noCarrinho >= MAX_POR_LINHA) {
      toast.error(`Máximo de ${MAX_POR_LINHA} por pedido`);
      return;
    }
    if (noCarrinho > 0) {
      onMudar(chave, 1);
      return;
    }
    const tamanhos = partesDeProduto
      .map((i) => {
        const p = produtoDe(i.event_product_id);
        return p?.tamanhos.find((t) => t.id === escolhasCompletas[i.event_product_id!])?.label;
      })
      .filter(Boolean);
    onAdicionar({
      lotId: chave,
      lotName: tamanhos.length ? `${c.combo.name} · ${tamanhos.join(', ')}` : c.combo.name,
      quantity: 1,
      price: Number(c.combo.price),
      tipo: 'bundle',
      bundleId: c.combo.id,
      escolhas: escolhasCompletas,
      baseDaTaxaUnit,
    });
  };

  return (
    <div className={cn('px-5 md:px-6 py-5 transition-colors', totalNoCarrinho > 0 && 'bg-primary/5')}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className="font-bold text-base text-foreground">{c.combo.name}</h4>
            {c.combo.description && (
              <p className="text-xs text-muted-foreground mt-1">{c.combo.description}</p>
            )}
          </div>
          <p className="font-bold text-2xl text-foreground shrink-0">{formatPrice(Number(c.combo.price))}</p>
        </div>

        <ul className="space-y-2">
          {c.itens.map((i) => {
            if (i.kind === 'lot') {
              const lote = lotesAbertos.find((l) => l.id === i.lot_id);
              return (
                <li key={i.id} className="flex items-center gap-2 text-sm text-foreground/90">
                  <Ticket className="w-4 h-4 text-primary shrink-0" />
                  {i.quantity}x {lote?.name ?? 'Ingresso'}
                </li>
              );
            }
            const p = produtoDe(i.event_product_id);
            if (!p) return null;
            return (
              <li key={i.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-foreground/90">
                  <Package className="w-4 h-4 text-primary shrink-0" />
                  {i.quantity}x {nomeDoProduto(p.produto)}
                </div>
                {p.tamanhos.length > 0 && (
                  <div className="pl-6">
                    <SeletorDeTamanho
                      produto={p}
                      escolhido={escolhas[p.ativacao.id] ?? null}
                      onEscolher={(v) => setEscolhas((e) => ({ ...e, [p.ativacao.id]: v }))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end gap-3">
          {noCarrinho > 0 && (
            <span className="text-sm text-primary font-semibold tabular-nums">{noCarrinho} no carrinho</span>
          )}
          <Button type="button" onClick={adicionar} className="rounded-full">
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bloco "Loja do evento" da página pública: combos e produtos avulsos.
 * Não renderiza nada quando o evento não tem loja.
 */
export function LojaDoEvento(props: Props) {
  const { loja, lotesAbertos } = props;

  // Combo com ingresso só vende se o lote dele está aberto: senão a pessoa
  // montaria o carrinho para ser recusada no pagamento.
  const combos = loja.combos.filter((c) =>
    c.itens.every((i) => i.kind !== 'lot' || lotesAbertos.some((l) => l.id === i.lot_id)));

  if (loja.produtos.length === 0 && combos.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-4"
    >
      <h2 className="font-display font-bold text-xl flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-primary" /> Loja do evento
      </h2>

      {combos.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden shadow-lg shadow-primary/5">
          <div className="px-5 md:px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border-b border-border/40">
            <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">Combos</h3>
          </div>
          <div className="divide-y divide-border/40">
            {combos.map((c) => <CartaoDeCombo key={c.combo.id} c={c} {...props} />)}
          </div>
        </div>
      )}

      {loja.produtos.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden shadow-lg shadow-primary/5">
          <div className="px-5 md:px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border-b border-border/40">
            <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">Produtos</h3>
          </div>
          <div className="divide-y divide-border/40">
            {loja.produtos.map((p) => (
              <CartaoDeProduto key={p.ativacao.id} p={p} {...props} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
