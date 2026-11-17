/**
 * Valor em reais que nunca sai cortado (OS-408, etapa 4).
 *
 * Num cartão estreito (notebook de 1280 a 1366, quatro cartões lado a lado) o
 * "R$ 103.000,00" não cabia e aparecia "R$ 103.000,(" ou "R$ 103.0...": número de
 * dinheiro cortado parece outro valor. Aqui a letra diminui até caber na caixa:
 * `cqi` é 1% da largura da caixa que guarda o valor, e o tamanho de sempre é o teto.
 *
 * Como usar: a caixa em volta do valor leva `CAIXA_DO_VALOR` (ela precisa ter
 * largura própria, por isso o `flex-1`), e o texto do valor leva uma das classes
 * abaixo no lugar do `text-*` de antes.
 *
 * A conta: "R$ 1.234.567,89" em negrito ocupa cerca de 8 vezes o tamanho da letra;
 * com a letra em 11% da caixa, ele usa uns 90% dela. Valores menores ficam no tamanho
 * de sempre.
 *
 * Encolher é a última rede, não o jeito de caber: abaixo de 1280 px (cartões da visão
 * geral e da aba Pedidos) e de 1536 px (topo do evento) o cartão do valor ocupa a linha
 * inteira, para a letra não ficar miúda (conferido de 390 a 1920 px: nunca abaixo de
 * 13 px, nem com R$ 1.236.000,00).
 */
export const CAIXA_DO_VALOR = 'min-w-0 flex-1 [container-type:inline-size]';

/** Era `text-xl md:text-2xl`. */
export const VALOR_QUE_CABE = 'whitespace-nowrap text-[length:min(1.25rem,11cqi)] md:text-[length:min(1.5rem,11cqi)]';

/** Era `text-lg` (topo do evento). */
export const VALOR_QUE_CABE_PEQUENO = 'whitespace-nowrap text-[length:min(1.125rem,11cqi)]';
