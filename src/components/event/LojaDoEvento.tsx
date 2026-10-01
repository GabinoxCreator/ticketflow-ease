import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Check, Minus, Package, Plus, ShoppingBag, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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

/**
 * Uma coisa comprável da loja. Produto avulso e pacote sem ingresso moram na
 * mesma prateleira (decisão do Gabriel, 01/10): o que leva CONVITE é combo e
 * fica em cima; o resto é loja.
 */
type Oferta =
  | { tipo: 'produto'; produto: ProdutoDaVitrine }
  | { tipo: 'pacote'; combo: ComboDaVitrine };

const precoDaOferta = (o: Oferta) =>
  o.tipo === 'produto' ? Number(o.produto.ativacao.price ?? 0) : Number(o.combo.combo.price);

const nomeDaOferta = (o: Oferta) =>
  o.tipo === 'produto' ? nomeDoProduto(o.produto.produto) : o.combo.combo.name;

const descricaoDaOferta = (o: Oferta) =>
  o.tipo === 'produto' ? o.produto.produto.description : o.combo.combo.description;

/** Produtos envolvidos numa oferta, com a quantidade de cada um. */
function produtosEnvolvidos(o: Oferta, loja: Loja): Array<{ p: ProdutoDaVitrine; quantidade: number }> {
  if (o.tipo === 'produto') return [{ p: o.produto, quantidade: 1 }];
  return o.combo.itens
    .filter((i) => i.kind === 'product')
    .map((i) => {
      const p = loja.produtos.find((x) => x.ativacao.id === i.event_product_id);
      return p ? { p, quantidade: i.quantity } : null;
    })
    .filter((x): x is { p: ProdutoDaVitrine; quantidade: number } => x !== null);
}

const fotoDaOferta = (o: Oferta, loja: Loja) =>
  produtosEnvolvidos(o, loja).find((x) => x.p.produto.image_url)?.p.produto.image_url ?? null;

const esgotadaOferta = (o: Oferta, loja: Loja) =>
  produtosEnvolvidos(o, loja).some(({ p }) => p.estoques.every((s) => disponivel(s) === 0));

/** Tamanhos, um botão por tamanho. Esgotado fica riscado e não clica. */
function SeletorDeTamanho({
  produto, escolhido, onEscolher,
}: {
  produto: ProdutoDaVitrine;
  escolhido: string | null;
  onEscolher: (variantId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Tamanho de ${nomeDoProduto(produto.produto)}`}>
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
              'min-w-12 h-11 px-3 rounded-xl border text-sm font-semibold transition-colors',
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

/**
 * O pop-up de compra. Serve para produto avulso, pacote e combo: é aqui que a
 * pessoa escolhe o tamanho e a quantidade.
 *
 * ⚠️ Por que o tamanho mora aqui, e não no card: antes o botão "Adicionar"
 * ficava na lista e recusava com um aviso no TOPO da página. No celular,
 * rolado até o botão, ninguém via o aviso e o botão parecia quebrado (relato
 * do Gabriel em 01/10, reproduzido). Agora não existe recusa: o botão só
 * acende quando a escolha está completa, e diz o que falta.
 */
function PopupDeCompra({
  oferta, aberto, onFechar, loja, lotesAbertos, itens, onAdicionar, onMudar, formatPrice,
}: {
  oferta: Oferta | null;
  aberto: boolean;
  onFechar: () => void;
} & Props) {
  const [escolhas, setEscolhas] = useState<Record<string, string | null>>({});
  const [quantidade, setQuantidade] = useState(1);

  const envolvidos = useMemo(
    () => (oferta ? produtosEnvolvidos(oferta, loja) : []),
    [oferta, loja],
  );

  if (!oferta) return null;

  const nome = nomeDaOferta(oferta);
  const preco = precoDaOferta(oferta);
  const foto = fotoDaOferta(oferta, loja);
  const descricao = descricaoDaOferta(oferta);

  const comTamanho = envolvidos.filter(({ p }) => p.tamanhos.length > 0);
  const faltaEscolher = comTamanho.filter(({ p }) => !escolhas[p.ativacao.id]);

  // Quanto ainda cabe: o menor estoque entre os produtos envolvidos, já no
  // tamanho escolhido quando ele importa.
  const restaDisponivel = envolvidos.reduce((menor, { p, quantidade: q }) => {
    const variantId = p.tamanhos.length > 0 ? (escolhas[p.ativacao.id] ?? null) : null;
    const estoque = estoqueDoTamanho(p, variantId);
    const resta = estoque ? Math.floor(disponivel(estoque) / q) : 0;
    return Math.min(menor, resta);
  }, Number.POSITIVE_INFINITY);
  const teto = Math.max(0, Math.min(MAX_POR_LINHA, restaDisponivel));

  const fechar = () => {
    onFechar();
    setEscolhas({});
    setQuantidade(1);
  };

  const confirmar = () => {
    if (faltaEscolher.length > 0 || quantidade < 1) return;

    if (oferta.tipo === 'produto') {
      const p = oferta.produto;
      const variantId = p.tamanhos.length > 0 ? (escolhas[p.ativacao.id] ?? null) : null;
      const chave = chaveDoProduto(p.ativacao.id, variantId);
      const jaNoCarrinho = itens.find((i) => i.lotId === chave)?.quantity ?? 0;
      const rotulo = p.tamanhos.find((t) => t.id === variantId)?.label;
      if (jaNoCarrinho > 0) {
        onMudar(chave, quantidade);
      } else {
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
        if (quantidade > 1) onMudar(chave, quantidade - 1);
      }
      fechar();
      return;
    }

    // pacote ou combo
    const c = oferta.combo;
    const partesDeProduto = c.itens.filter((i) => i.kind === 'product');
    const escolhasCompletas: Record<string, string | null> = {};
    for (const i of partesDeProduto) escolhasCompletas[i.event_product_id!] = escolhas[i.event_product_id!] ?? null;

    const chave = chaveDoCombo(c.combo.id, escolhasCompletas);
    const jaNoCarrinho = itens.find((i) => i.lotId === chave)?.quantity ?? 0;

    // A parte do pacote que entra na base da taxa — a mesma conta do servidor,
    // linha a linha, para a tela não prometer um total diferente do cobrado.
    const baseDaTaxaUnit = c.itens.reduce((s, i) => {
      const absorve = i.kind === 'lot'
        ? lotesAbertos.find((l) => l.id === i.lot_id)?.modo_taxa === 'absorve'
        : loja.produtos.find((p) => p.ativacao.id === i.event_product_id)?.ativacao.modo_taxa === 'absorve';
      return absorve ? s : s + Number(i.unit_face_share) * i.quantity;
    }, 0);

    if (jaNoCarrinho > 0) {
      onMudar(chave, quantidade);
    } else {
      const rotulos = partesDeProduto
        .map((i) => {
          const p = loja.produtos.find((x) => x.ativacao.id === i.event_product_id);
          return p?.tamanhos.find((t) => t.id === escolhasCompletas[i.event_product_id!])?.label;
        })
        .filter(Boolean);
      onAdicionar({
        lotId: chave,
        lotName: rotulos.length ? `${c.combo.name} · ${rotulos.join(', ')}` : c.combo.name,
        quantity: 1,
        price: Number(c.combo.price),
        tipo: 'bundle',
        bundleId: c.combo.id,
        escolhas: escolhasCompletas,
        baseDaTaxaUnit,
      });
      if (quantidade > 1) onMudar(chave, quantidade - 1);
    }
    fechar();
  };

  const entrega = envolvidos[0]?.p.ativacao;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left pr-6">{nome}</DialogTitle>
          {descricao && <DialogDescription className="text-left">{descricao}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {foto && (
            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-muted">
              <img src={foto} alt={nome} className="w-full h-full object-contain" />
            </div>
          )}

          {oferta.tipo === 'pacote' && (
            <ul className="space-y-1.5">
              {oferta.combo.itens.map((i) => {
                // O ingresso NÃO está em `loja.produtos` — ele é lote. Sem este
                // ramo, o convite aparecia como "1x Produto" dentro do combo.
                if (i.kind === 'lot') {
                  const lote = lotesAbertos.find((l) => l.id === i.lot_id);
                  return (
                    <li key={i.id} className="flex items-center gap-2 text-sm text-foreground/90">
                      <Ticket className="w-4 h-4 text-primary shrink-0" />
                      {i.quantity}x {lote?.name ?? 'Ingresso'}
                    </li>
                  );
                }
                const p = loja.produtos.find((x) => x.ativacao.id === i.event_product_id);
                return (
                  <li key={i.id} className="flex items-center gap-2 text-sm text-foreground/90">
                    <Package className="w-4 h-4 text-primary shrink-0" />
                    {i.quantity}x {p ? nomeDoProduto(p.produto) : 'Produto'}
                  </li>
                );
              })}
            </ul>
          )}

          {comTamanho.map(({ p }) => (
            <div key={p.ativacao.id} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {comTamanho.length > 1 ? `Tamanho — ${nomeDoProduto(p.produto)}` : 'Escolha o tamanho'}
              </p>
              <SeletorDeTamanho
                produto={p}
                escolhido={escolhas[p.ativacao.id] ?? null}
                onEscolher={(v) => setEscolhas((e) => ({ ...e, [p.ativacao.id]: v }))}
              />
            </div>
          ))}

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">Quantidade</span>
            <div className="flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-1.5">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                disabled={quantidade <= 1}
                className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-lg font-semibold tabular-nums">{quantidade}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => setQuantidade((q) => Math.min(teto || 1, q + 1))}
                disabled={quantidade >= teto}
                className="w-9 h-9 rounded-full border border-primary/60 bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {entrega?.fulfillment && (
            <p className="text-xs text-muted-foreground">
              {NOME_DA_ENTREGA[entrega.fulfillment]}
              {entrega.fulfillment_info ? `: ${entrega.fulfillment_info}` : null}
            </p>
          )}

          <Button
            type="button"
            onClick={confirmar}
            disabled={faltaEscolher.length > 0 || teto < 1}
            className="w-full h-12 rounded-xl text-base"
          >
            {teto < 1
              ? 'Esgotado'
              : faltaEscolher.length > 0
                ? 'Escolha o tamanho'
                : `Adicionar • ${formatPrice(preco * quantidade)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O quadradinho da prateleira: foto, nome, preço e um botão só. */
function CardDaVitrine({
  oferta, loja, itens, formatPrice, onAbrir,
}: {
  oferta: Oferta;
  loja: Loja;
  itens: ItemDoCarrinho[];
  formatPrice: (v: number) => string;
  onAbrir: () => void;
}) {
  const nome = nomeDaOferta(oferta);
  const preco = precoDaOferta(oferta);
  const foto = fotoDaOferta(oferta, loja);
  const esgotado = esgotadaOferta(oferta, loja);

  const noCarrinho = itens
    .filter((i) => (oferta.tipo === 'produto'
      ? i.eventProductId === oferta.produto.ativacao.id && i.tipo === 'product'
      : i.bundleId === oferta.combo.combo.id))
    .reduce((s, i) => s + i.quantity, 0);

  const semTaxa = oferta.tipo === 'produto' && oferta.produto.ativacao.modo_taxa === 'absorve';

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card/60 backdrop-blur-xl overflow-hidden transition-colors',
        noCarrinho > 0 ? 'border-primary/60' : 'border-border/60',
        esgotado && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        disabled={esgotado}
        className="relative aspect-square bg-muted overflow-hidden disabled:cursor-not-allowed"
        aria-label={`Ver ${nome}`}
      >
        {foto
          ? <img src={foto} alt={nome} className="w-full h-full object-cover" loading="lazy" />
          : <span className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-muted-foreground" /></span>}
        {noCarrinho > 0 && (
          <span className="absolute top-2 right-2 min-w-7 h-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
            {noCarrinho}
          </span>
        )}
        {esgotado && (
          <span className="absolute inset-x-0 bottom-0 bg-background/85 py-1.5">
            <Badge variant="secondary" className="text-[11px]">Esgotado</Badge>
          </span>
        )}
      </button>

      <div className="flex flex-col flex-1 gap-2 p-3">
        <h4 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">{nome}</h4>
        <div className="mt-auto space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="font-bold text-lg text-foreground">{formatPrice(preco)}</p>
            {semTaxa && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400">
                <BadgeCheck className="w-3 h-3" /> sem taxa
              </span>
            )}
          </div>
          <Button
            type="button"
            onClick={onAbrir}
            disabled={esgotado}
            variant={noCarrinho > 0 ? 'secondary' : 'default'}
            className="w-full rounded-xl"
            size="sm"
          >
            {noCarrinho > 0
              ? <><Check className="w-4 h-4 mr-1" /> No carrinho</>
              : <><Plus className="w-4 h-4 mr-1" /> Adicionar</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O combo que leva CONVITE: card largo, com a foto do produto ao lado. */
function CardDeCombo({
  c, loja, lotesAbertos, itens, formatPrice, onAbrir,
}: {
  c: ComboDaVitrine;
  loja: Loja;
  lotesAbertos: LoteAberto[];
  itens: ItemDoCarrinho[];
  formatPrice: (v: number) => string;
  onAbrir: () => void;
}) {
  const oferta: Oferta = { tipo: 'pacote', combo: c };
  const foto = fotoDaOferta(oferta, loja);
  const esgotado = esgotadaOferta(oferta, loja);
  const noCarrinho = itens.filter((i) => i.bundleId === c.combo.id).reduce((s, i) => s + i.quantity, 0);

  // Quanto custaria comprando cada coisa separada — é o que mostra a vantagem.
  const separado = c.itens.reduce((s, i) => {
    if (i.kind === 'lot') return s;
    const p = loja.produtos.find((x) => x.ativacao.id === i.event_product_id);
    return s + Number(p?.ativacao.price ?? 0) * i.quantity;
  }, 0) + c.itens.reduce((s, i) => {
    if (i.kind !== 'lot') return s;
    return s + Number(i.unit_face_share) * i.quantity;
  }, 0);
  const economia = separado - Number(c.combo.price);

  return (
    <div
      className={cn(
        'flex gap-4 p-4 rounded-2xl border bg-card/60 backdrop-blur-xl transition-colors',
        noCarrinho > 0 ? 'border-primary/60' : 'border-border/60',
        esgotado && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        disabled={esgotado}
        aria-label={`Ver ${c.combo.name}`}
        className="w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-xl overflow-hidden bg-muted disabled:cursor-not-allowed"
      >
        {foto
          ? <img src={foto} alt={c.combo.name} className="w-full h-full object-cover" loading="lazy" />
          : <span className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-muted-foreground" /></span>}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* No celular o preço vai ABAIXO do nome: lado a lado, "Convite +
            camiseta + copo" quebrava em três linhas e esbarrava no valor. */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
          <div className="min-w-0">
            <h4 className="font-bold text-base text-foreground text-balance">{c.combo.name}</h4>
            {c.combo.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{c.combo.description}</p>
            )}
          </div>
          <div className="flex items-baseline gap-2 sm:block sm:text-right shrink-0">
            <p className="font-bold text-xl text-foreground">{formatPrice(Number(c.combo.price))}</p>
            {economia > 0 && (
              <p className="text-[11px] text-green-400 font-semibold">economiza {formatPrice(economia)}</p>
            )}
          </div>
        </div>

        <ul className="space-y-1">
          {c.itens.map((i) => {
            const lote = i.kind === 'lot' ? lotesAbertos.find((l) => l.id === i.lot_id) : null;
            const p = i.kind === 'product' ? loja.produtos.find((x) => x.ativacao.id === i.event_product_id) : null;
            return (
              <li key={i.id} className="flex items-center gap-2 text-xs text-foreground/80">
                {i.kind === 'lot'
                  ? <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <Package className="w-3.5 h-3.5 text-primary shrink-0" />}
                {i.quantity}x {i.kind === 'lot' ? (lote?.name ?? 'Ingresso') : (p ? nomeDoProduto(p.produto) : 'Produto')}
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          onClick={onAbrir}
          disabled={esgotado}
          variant={noCarrinho > 0 ? 'secondary' : 'default'}
          className="rounded-xl self-start"
          size="sm"
        >
          {noCarrinho > 0
            ? <><Check className="w-4 h-4 mr-1" /> {noCarrinho} no carrinho</>
            : <><Plus className="w-4 h-4 mr-1" /> Adicionar</>}
        </Button>
      </div>
    </div>
  );
}

/**
 * Bloco "Loja do evento" da página pública.
 *
 * Arrumação decidida pelo Gabriel em 01/10: **combo é o que leva CONVITE**
 * (fica em cima, em card largo com foto); **o que não leva convite é loja** —
 * produto avulso e pacote só de produto dividem a mesma prateleira de
 * quadradinhos, como e-commerce.
 */
export function LojaDoEvento(props: Props) {
  const { loja, lotesAbertos, formatPrice, itens } = props;
  const [aberta, setAberta] = useState<Oferta | null>(null);

  const temIngresso = (c: ComboDaVitrine) => c.itens.some((i) => i.kind === 'lot');

  // Combo com ingresso só vende se o lote dele está aberto: senão a pessoa
  // montaria o carrinho para ser recusada no pagamento.
  const loteAberto = (c: ComboDaVitrine) =>
    c.itens.every((i) => i.kind !== 'lot' || lotesAbertos.some((l) => l.id === i.lot_id));

  const combos = loja.combos.filter((c) => temIngresso(c) && loteAberto(c));
  const pacotes = loja.combos.filter((c) => !temIngresso(c));

  const prateleira: Oferta[] = [
    ...loja.produtos.map((produto) => ({ tipo: 'produto' as const, produto })),
    ...pacotes.map((combo) => ({ tipo: 'pacote' as const, combo })),
  ];

  if (prateleira.length === 0 && combos.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-5"
    >
      <h2 className="font-display font-bold text-xl flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-primary" /> Loja do evento
      </h2>

      {combos.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">
            Combos com convite
          </h3>
          <div className="space-y-3">
            {combos.map((c) => (
              <CardDeCombo
                key={c.combo.id}
                c={c}
                loja={loja}
                lotesAbertos={lotesAbertos}
                itens={itens}
                formatPrice={formatPrice}
                onAbrir={() => setAberta({ tipo: 'pacote', combo: c })}
              />
            ))}
          </div>
        </section>
      )}

      {prateleira.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">
            Produtos
          </h3>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {prateleira.map((o) => (
              <CardDaVitrine
                key={o.tipo === 'produto' ? o.produto.ativacao.id : o.combo.combo.id}
                oferta={o}
                loja={loja}
                itens={itens}
                formatPrice={formatPrice}
                onAbrir={() => setAberta(o)}
              />
            ))}
          </div>
        </section>
      )}

      <PopupDeCompra
        {...props}
        oferta={aberta}
        aberto={aberta !== null}
        onFechar={() => setAberta(null)}
      />
    </motion.div>
  );
}
