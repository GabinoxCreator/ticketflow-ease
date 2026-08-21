import { AlertCircle, Minus, Plus, BadgeCheck, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface LotCardLot {
  id: string;
  name: string;
  price: number;
  original_price?: number | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity?: number;
  description?: string | null;
  fake_scarcity_enabled?: boolean | null;
  fake_scarcity_percentage?: number | null;
  manually_sold_out?: boolean;
  /** 'absorve' = o preço já inclui tudo; nada é somado no checkout. */
  modo_taxa?: string | null;
  /** Teto de parcelas deste lote. */
  max_parcelas?: number | null;
}

interface LotCardProps {
  lot: LotCardLot;
  quantity: number;
  onQuantityChange: (delta: number) => void;
  formatPrice: (price: number) => string;
  maxQuantity?: number;
  /** Motivo pelo qual não dá para somar mais um (regra de 1 por noite).
   *  Null = liberado. O botão fica cinza, mas continua CLICÁVEL: é o clique
   *  que explica o porquê — botão morto não ensina nada. */
  bloqueioDeSoma?: string | null;
  /** Nome completo do lote, para leitor de tela. O `lot.name` chega encurtado
   *  na vitrine (o cabeçalho do dia já diz a data) e, sem isto, cinco botões
   *  diferentes anunciariam "1º Lote" — indistinguíveis para quem não vê. */
  nomeCompleto?: string;
}

export const LotCard = ({ lot, quantity, onQuantityChange, formatPrice, maxQuantity = 10, bloqueioDeSoma = null, nomeCompleto }: LotCardProps) => {
  const nomeParaLeitor = nomeCompleto || lot.name;
  const available = lot.total_quantity - lot.sold_quantity - (lot.reserved_quantity || 0);
  const isSoldOut = available === 0 || lot.manually_sold_out === true;

  const realPct = lot.total_quantity > 0 ? (lot.sold_quantity / lot.total_quantity) * 100 : 0;
  const fakePct = lot.fake_scarcity_enabled ? lot.fake_scarcity_percentage || 0 : 0;
  const shownPct = Math.max(0, Math.min(100, Math.max(realPct, fakePct)));

  const isCritical = !isSoldOut && (shownPct >= 90 || available <= 10);
  const isWarning = !isSoldOut && !isCritical && shownPct >= 70;
  const showProgress = !isSoldOut && (lot.fake_scarcity_enabled || shownPct >= 70);

  return (
    <div
      className={cn(
        'px-5 md:px-6 py-5 transition-colors',
        isSoldOut && 'opacity-50',
        quantity > 0 && 'bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h4 className="font-bold text-base text-foreground">{lot.name}</h4>
            {isSoldOut && <Badge variant="secondary" className="text-xs">Esgotado</Badge>}
            {isCritical && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertCircle className="w-3 h-3" />
                Últimas unidades
              </Badge>
            )}
            {isWarning && (
              <Badge
                variant="secondary"
                className="text-xs gap-1 bg-orange-500/20 text-orange-400 border-orange-500/30"
              >
                <AlertCircle className="w-3 h-3" />
                Quase esgotado
              </Badge>
            )}
          </div>

          {/* Vantagens do lote, lidas do próprio lote — nada fixo por evento.
              Quando o produtor absorve, o preço da vitrine é o preço final: não
              existe taxa somada no checkout, e dizer isso aqui vale mais do que
              o comprador descobrir sozinho no fim. */}
          {(lot.modo_taxa === 'absorve' || (lot.max_parcelas ?? 0) > 1) && !isSoldOut && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {lot.modo_taxa === 'absorve' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-400">
                  <BadgeCheck className="w-3 h-3" /> Sem taxa
                </span>
              )}
              {(lot.max_parcelas ?? 0) > 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  <CreditCard className="w-3 h-3" /> Até {lot.max_parcelas}x sem juros
                </span>
              )}
            </div>
          )}

          {lot.description && (
            <p className="text-xs text-muted-foreground mb-2">{lot.description}</p>
          )}

          <div className="flex items-center gap-2">
            {lot.original_price && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(lot.original_price)}
              </span>
            )}
            <span className="font-bold text-2xl text-foreground">{formatPrice(lot.price)}</span>
          </div>

          {showProgress && (
            <div className="mt-3 space-y-1">
              <Progress
                value={shownPct}
                className={cn('h-1.5', isCritical && '[&>div]:bg-destructive')}
              />
              <p className={cn('text-xs', isCritical ? 'text-destructive' : 'text-muted-foreground')}>
                {Math.round(shownPct)}% vendido
              </p>
            </div>
          )}
        </div>

        {!isSoldOut && (
          <div
            className={cn(
              'flex items-center gap-1 shrink-0 rounded-full bg-background/40 backdrop-blur-sm border px-1.5 py-1.5 transition-colors',
              quantity > 0 ? 'border-primary/50' : 'border-border/50',
            )}
          >
            <button
              onClick={() => onQuantityChange(-1)}
              aria-label={`Remover um ingresso de ${nomeParaLeitor}`}
              disabled={quantity === 0}
              className={cn(
                'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
                quantity === 0
                  ? 'border-border/40 text-muted-foreground/50 cursor-not-allowed'
                  : 'border-border/60 bg-background/60 text-foreground hover:bg-primary/20 hover:border-primary/50',
              )}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span
              className={cn(
                'w-8 text-center text-lg font-semibold tabular-nums transition-colors',
                quantity > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {quantity}
            </span>
            <button
              onClick={() => onQuantityChange(1)}
              aria-label={`Adicionar um ingresso de ${nomeParaLeitor}`}
              /* ⚠️ `bloqueioDeSoma` NÃO entra no `disabled`. Botão desabilitado
                 não dispara clique — a pessoa toca e não acontece nada, sem
                 saber por quê. Cinza para avisar, clicável para explicar. */
              disabled={quantity >= maxQuantity || quantity >= available}
              className={cn(
                'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
                quantity >= maxQuantity || quantity >= available || bloqueioDeSoma
                  ? 'border-border/40 text-muted-foreground/50'
                  : 'border-border/60 bg-background/60 text-foreground hover:bg-primary/20 hover:border-primary/50',
                (quantity >= maxQuantity || quantity >= available) && 'cursor-not-allowed',
              )}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LotCard;
