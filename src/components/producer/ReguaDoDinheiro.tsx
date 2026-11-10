import { ArrowUpRight, Banknote, DollarSign, Hand, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/painelDoProdutor';

/*
 * A régua do dinheiro do painel do produtor (OS-408, 09/11/2026).
 *
 * As cinco palavras aprovadas pelo Gabriel, sempre nesta ordem, em toda tela de
 * dinheiro: Vendido · Taxa do comprador · Recebido direto por você · A receber da
 * FestPag · Já pago. Antes eram quatro nomes para "receita" ("Receita Total",
 * "Vendas Totais", "Receita Líquida", "Balanço Disponível"...).
 *
 * Este componente SÓ MOSTRA. Os números chegam prontos de quem chama, saídos de
 * `useProducerFinance` (a mesma conta do pedido de repasse no banco). Nenhuma conta
 * mora aqui. "A receber da FestPag" é o que ainda falta pagar (decisão do Gabriel
 * em 09/11: "Só o que falta"), por isso vem sempre junto de "Já pago".
 */

export interface NumerosDaRegua {
  /** Valor dos ingressos de toda venda paga, sem taxa (valor de face). */
  vendido: number;
  /** Taxa de conveniência paga por quem compra. Não entra na conta do produtor. null = "—". */
  taxaDoComprador: number | null;
  /** Juro de parcelamento pago por quem compra (vai na mesma linha da taxa). */
  juro?: number;
  /** Venda manual e dinheiro: o produtor recebeu na mão, não passou pela FestPag. */
  recebidoDireto: number;
  /** O que a FestPag ainda vai transferir. null = não deu para saber (mostra "—"). */
  aReceber: number | null;
  /** Repasses já transferidos. null = não deu para saber (mostra "—"). */
  jaPago: number | null;
}

const valor = (n: number | null, carregando?: boolean) => (carregando || n == null ? '—' : formatBRL(n));

const LINHAS = (n: NumerosDaRegua) => [
  {
    chave: 'vendido',
    rotulo: 'Vendido',
    numero: n.vendido,
    dica: 'Valor dos ingressos de toda venda paga, sem taxa.',
    icone: DollarSign,
  },
  {
    chave: 'taxa',
    rotulo: 'Taxa do comprador',
    numero: n.taxaDoComprador,
    dica:
      'Paga por quem compra. Não entra na sua conta.' +
      (n.juro && n.juro > 0 ? ` Mais ${formatBRL(n.juro)} de juro de parcelamento, também pago por quem compra.` : ''),
    icone: Receipt,
  },
  {
    chave: 'direto',
    rotulo: 'Recebido direto por você',
    numero: n.recebidoDireto,
    dica: 'Venda manual e dinheiro. Não passou pela FestPag.',
    icone: Hand,
  },
  {
    chave: 'receber',
    rotulo: 'A receber da FestPag',
    numero: n.aReceber,
    dica: 'O que a FestPag ainda vai transferir para você.',
    icone: Banknote,
  },
  {
    chave: 'pago',
    rotulo: 'Já pago',
    numero: n.jaPago,
    dica: 'Repasses já transferidos.',
    icone: ArrowUpRight,
  },
];

/** Os cinco números lado a lado (Financeiro, aba Financeiro do evento). */
export function ReguaEmCartoes({ numeros, carregando }: { numeros: NumerosDaRegua; carregando?: boolean }) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" data-testid="regua-do-dinheiro">
      {LINHAS(numeros).map((l) => (
        <Card
          key={l.chave}
          className={cn(l.chave === 'receber' && 'border-primary/40 bg-gradient-to-br from-primary/10 to-primary/5')}
          data-regua={l.chave}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <l.icone className="w-4 h-4 flex-shrink-0" /> {l.rotulo}
            </div>
            <div className="text-2xl font-bold mt-1.5 tabular-nums break-words" data-regua-valor={l.chave}>
              {valor(l.numero, carregando)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{l.dica}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Os cinco números um embaixo do outro, com a conta escrita (Financeiro do evento). */
export function ReguaEmLista({ numeros, carregando }: { numeros: NumerosDaRegua; carregando?: boolean }) {
  return (
    <div className="space-y-3 text-sm" data-testid="regua-do-dinheiro">
      {LINHAS(numeros).map((l) => (
        <div
          key={l.chave}
          className={cn('flex justify-between gap-3', l.chave === 'receber' && 'border-t pt-3 font-semibold')}
          data-regua={l.chave}
        >
          <div className="min-w-0">
            <div className={cn(l.chave === 'receber' ? 'text-foreground' : 'text-muted-foreground')}>{l.rotulo}</div>
            <div className="text-[11px] text-muted-foreground font-normal leading-snug">{l.dica}</div>
          </div>
          <span className="tabular-nums whitespace-nowrap" data-regua-valor={l.chave}>
            {valor(l.numero, carregando)}
          </span>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground border-t pt-2">
        A receber da FestPag = Vendido − Recebido direto por você − Já pago.
      </p>
    </div>
  );
}
