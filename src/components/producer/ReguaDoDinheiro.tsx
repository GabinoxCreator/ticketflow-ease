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
 *
 * Taxa absorvida (OS-431, 15/11/2026, depois da OS-426 de 13/11): nos lotes "Sem
 * taxa" o produtor paga a taxa de serviço, e `order_producer_value` já a desconta
 * (face × percentual do evento, antes do cupom). Por isso "Vendido" chega aqui SEM
 * ela, e a diferença entre o que o comprador pagou e "Vendido + Taxa do comprador"
 * (o `juro`, que vem de `interest`) passou a ter duas partes: o custo do cartão e
 * essa taxa. A régua não separa as duas porque o banco não devolve a taxa absorvida
 * ao painel; separar aqui seria refazer a conta do repasse no navegador.
 *
 * Taxa do dinheiro (OS-416, 16/11/2026): numa venda em dinheiro na maquininha o
 * produtor fica com tudo o que o comprador pagou, inclusive a parte que é da FestPag (no lote normal,
 * a taxa do comprador, OS-412; no lote "Sem taxa", a taxa paga por ele, OS-426). Essa
 * taxa entra em "Recebido direto por você" (o que ele tem na mão) e sai de "A receber
 * da FestPag". Assim a conta de baixo continua fechando sem linha nova. Quando ela
 * passa do que a FestPag ainda tinha a transferir, "A receber" fica negativo e a
 * frase diz quanto ele deve (decisão do Gabriel de 16/11, "Mostrar aos dois"). As
 * frases só aparecem quando houve taxa no dinheiro e moram juntas em
 * `FRASES_DA_TAXA_DO_DINHEIRO`.
 */

/**
 * As frases da taxa do dinheiro (OS-416), todas aprovadas pelo Gabriel em 16/11/2026:
 * A e B ("Aprovar as duas", com "taxa das vendas em dinheiro" pelo "Trocar nas duas",
 * porque no lote "Sem taxa" quem paga a taxa é o produtor), a frase da dívida
 * ("Número negativo + frase") e, quando a dívida passa da taxa do dinheiro (parte dela
 * vem de outra coisa, como reembolso depois do repasse), a que separa ("Frase que
 * separa"). "Taxa das vendas em dinheiro" é só a da maquininha ("Só a maquininha").
 */
const FRASES_DA_TAXA_DO_DINHEIRO = {
  recebidoDireto: (taxa: number) =>
    ` Inclui ${formatBRL(taxa)} de taxa das vendas em dinheiro, que é da FestPag e sai do que você tem a receber.`,
  aReceber: (taxa: number) =>
    ` Já descontamos aqui os ${formatBRL(taxa)} de taxa das vendas em dinheiro, que ficou com você.`,
  /**
   * No lugar da frase inteira do "A receber" quando ele dá negativo. Dívida até a
   * taxa do dinheiro: ela é a causa. Dívida maior: a frase diz que é só uma parte.
   */
  divida: (deve: number, taxa: number) =>
    deve <= taxa + 0.005
      ? `Você deve ${formatBRL(deve)} à FestPag. A taxa das vendas em dinheiro (${formatBRL(taxa)}) ficou com você e passou do que ainda tínhamos para transferir.`
      : `Você deve ${formatBRL(deve)} à FestPag. Parte disso é a taxa das vendas em dinheiro (${formatBRL(taxa)}), que ficou com você.`,
};

export interface NumerosDaRegua {
  /**
   * Valor dos ingressos para o produtor em toda venda paga (`order_producer_value`):
   * face menos cupom e reembolso e, nos lotes "Sem taxa", menos a taxa de serviço.
   */
  vendido: number;
  /** Taxa de conveniência paga por quem compra. Não entra na conta do produtor. null = "—". */
  taxaDoComprador: number | null;
  /**
   * O que fica fora da conta do produtor além da taxa do comprador (vem de
   * `useProducerFinance.interest`): custo do cartão (processamento e juro), pago por
   * quem compra, e, nos lotes "Sem taxa", a taxa de serviço paga pelo produtor.
   */
  juro?: number;
  /**
   * Venda manual e dinheiro: o produtor recebeu na mão, não passou pela FestPag. No
   * dinheiro, inclui a taxa das vendas em dinheiro (OS-416).
   */
  recebidoDireto: number;
  /**
   * Taxa das vendas em dinheiro na maquininha (OS-416): está em "Recebido direto" e
   * sai de "A receber". Só serve para as frases; 0 ou ausente = não aparecem.
   */
  taxaDoDinheiro?: number;
  /**
   * Parte da taxa do dinheiro que já saiu do "A receber" mostrado (frase B). Ausente =
   * `taxaDoDinheiro`. No total do Financeiro é só a dos eventos que não estão devendo:
   * cada evento é uma conta, e a dívida de um não abate o saldo de outro.
   */
  taxaNoAReceber?: number;
  /**
   * O que a FestPag ainda vai transferir. null = não deu para saber (mostra "—").
   * Negativo = o produtor deve à FestPag (só num evento com taxa no dinheiro; o total
   * do Financeiro soma só o que dá para sacar).
   */
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
    dica: 'Valor dos ingressos de toda venda paga, menos cupons e reembolsos. Nos lotes "Sem taxa", a taxa de serviço é paga por você e já saiu daqui.',
    icone: DollarSign,
  },
  {
    chave: 'taxa',
    rotulo: 'Taxa do comprador',
    numero: n.taxaDoComprador,
    dica:
      'Paga por quem compra. Não entra na sua conta.' +
      (n.juro && n.juro > 0
        ? ` Também ficam fora da sua conta ${formatBRL(n.juro)}: o custo do cartão, pago por quem compra, e, nos lotes "Sem taxa", a taxa de serviço, paga por você.`
        : ''),
    icone: Receipt,
  },
  {
    chave: 'direto',
    rotulo: 'Recebido direto por você',
    numero: n.recebidoDireto,
    dica:
      'Venda manual e dinheiro. Não passou pela FestPag.' +
      (n.taxaDoDinheiro && n.taxaDoDinheiro > 0 ? FRASES_DA_TAXA_DO_DINHEIRO.recebidoDireto(n.taxaDoDinheiro) : ''),
    icone: Hand,
  },
  {
    chave: 'receber',
    rotulo: 'A receber da FestPag',
    numero: n.aReceber,
    dica:
      // Negativo só existe com taxa no dinheiro (useProducerFinance): é dívida.
      n.aReceber != null && n.aReceber < 0 && n.taxaDoDinheiro && n.taxaDoDinheiro > 0
        ? FRASES_DA_TAXA_DO_DINHEIRO.divida(-n.aReceber, n.taxaDoDinheiro)
        : 'O que a FestPag ainda vai transferir para você.' +
          // Sem o número (membro da produtora que não é o dono vê "—"), a frase não diz
          // que "já descontamos aqui": não há "aqui" na tela.
          (n.aReceber != null && (n.taxaNoAReceber ?? n.taxaDoDinheiro ?? 0) > 0
            ? FRASES_DA_TAXA_DO_DINHEIRO.aReceber(n.taxaNoAReceber ?? n.taxaDoDinheiro)
            : ''),
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
