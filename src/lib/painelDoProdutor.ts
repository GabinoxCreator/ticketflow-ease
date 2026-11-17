/*
 * As palavras do painel do produtor, num lugar só (OS-408, 09/11/2026).
 *
 * Nasceu do pente fino do painel: o produtor lia "pix", "used", "show",
 * "16:00:00", "R$ 15.00 OFF" e "TypeError: Failed to fetch", que são os valores
 * crus do banco e do navegador. Aqui cada um vira a palavra que ele lê. Só
 * traduz e formata: nenhuma conta de dinheiro mora neste arquivo.
 */
import { CATEGORIAS } from '@/lib/categorias-de-evento';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** R$ 1.234,56. Um formatador só formata: nunca trocar valor aqui (ver OS-108). */
export const formatBRL = (n: unknown): string => moeda.format(Number(n ?? 0));

/**
 * Forma de pagamento como o produtor lê. O banco guarda de vários jeitos:
 * 'pix', 'card', 'card_credit', 'card_debit', 'cash' (site e maquininha),
 * 'cartao_credito', 'dinheiro'... (venda manual e portaria) e, em pedido antigo
 * do Mercado Pago, 'pix:<id>' e 'card:<id>'. Valor desconhecido volta null,
 * para a tela não mostrar código cru.
 */
const FORMAS: Record<string, string> = {
  pix: 'PIX',
  card: 'Cartão',
  credit_card: 'Cartão',
  cartao: 'Cartão',
  card_credit: 'Cartão de crédito',
  cartao_credito: 'Cartão de crédito',
  card_debit: 'Cartão de débito',
  debit_card: 'Cartão de débito',
  cartao_debito: 'Cartão de débito',
  cash: 'Dinheiro',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  manual: 'Venda manual',
  courtesy: 'Cortesia',
  outro: 'Outro',
};

export function formaDePagamento(valor?: string | null): string | null {
  if (!valor) return null;
  const chave = valor.toLowerCase().split(':')[0].trim();
  return FORMAS[chave] ?? null;
}

/** Situação do ingresso (texto aprovado pelo Gabriel em 09/11/2026). */
const SITUACAO_DO_INGRESSO: Record<string, string> = {
  valid: 'Ainda não entrou',
  used: 'Entrou',
  cancelled: 'Cancelado',
  pending: 'Aguardando pagamento',
};

export function situacaoDoIngresso(status?: string | null): string {
  if (!status) return '';
  return SITUACAO_DO_INGRESSO[status] ?? 'Outra situação';
}

/** Situação do repasse ao produtor ('requested' e 'paid' são as que o banco usa). */
const SITUACAO_DO_REPASSE: Record<string, string> = {
  requested: 'Solicitado',
  paid: 'Pago',
};

export function situacaoDoRepasse(status?: string | null): string {
  if (!status) return '';
  return SITUACAO_DO_REPASSE[status] ?? 'Outra situação';
}

/**
 * Situação do pedido. "Prazo venceu" e "Pagamento recusado" valem para PIX, cartão
 * e maquininha: antes a tela dizia "PIX venceu" e "Cartão recusado", e quase 4 em
 * cada 10 pedidos vencidos eram de cartão (revisão da OS-408, 09/11/2026).
 * "Contestação" é a palavra que a casa usa para chargeback.
 */
export const SITUACAO_DO_PEDIDO: Record<string, string> = {
  paid: 'Pago',
  completed: 'Pago',
  pending: 'Pendente',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Pagamento recusado',
  expired: 'Prazo venceu',
  charged_back: 'Contestação',
};

/** 'shows-e-musica' → 'Shows e Música'. Categoria fora da lista vira 'Outros'. */
export function nomeDaCategoria(slug?: string | null): string {
  if (!slug) return 'Não informada';
  return CATEGORIAS.find((c) => c.slug === slug)?.nome ?? 'Outros';
}

/** '16:00:00' → '16:00'. */
export function horaCurta(hora?: string | null): string {
  if (!hora) return '';
  return hora.slice(0, 5);
}

/** Cupom: '10% de desconto' ou 'R$ 15,00 de desconto'. */
export function descontoDoCupom(tipo: string, valor: number | string): string {
  return tipo === 'percent'
    ? `${String(Number(valor)).replace('.', ',')}% de desconto`
    : `${formatBRL(valor)} de desconto`;
}

/** O que o produtor lê quando a gravação não chega ao servidor. */
export const SEM_INTERNET = 'Não deu para salvar. Confira a internet e tente de novo.';

/**
 * Mensagem de erro para o aviso da tela. Erro de rede do navegador ("TypeError:
 * Failed to fetch", "Load failed", "NetworkError...") nunca aparece cru: vira a
 * frase acima. Recusa do banco (que já vem em português) passa como veio.
 */
export function mensagemDeErro(erro: unknown, prefixo?: string): string {
  const texto = String((erro as { message?: string } | null)?.message ?? erro ?? '').trim();
  // Só as frases de rede: um "TypeError" de defeito de código não é falta de internet.
  if (!texto || /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(texto)) {
    return SEM_INTERNET;
  }
  return prefixo ? `${prefixo}: ${texto}` : texto;
}
