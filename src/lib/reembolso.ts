/*
 * Reembolso pela conta do comprador (OS-103, 02/10/2026).
 *
 * A REGRA NÃO MORA AQUI. Prazo, janela, valor de cada ingresso e se a taxa
 * volta são decididos no banco (`reembolso_regra` e `reembolso_valores`). A
 * tela só mostra o que o servidor respondeu, e o texto da regra vem do
 * `RESUMO_REEMBOLSO`. Nenhum prazo é escrito neste arquivo.
 *
 * `as any` nas chamadas porque `types.ts` é auto-gerado e só vai conhecer as
 * funções novas depois que a migration subir e o Lovable regerar o arquivo
 * (mesmo contorno do `registrar_meu_aceite`).
 */
import { supabase } from '@/integrations/supabase/client';
import { IDENTIDADE_FESTPAG } from '@/lib/identidade-festpag';
import { RESUMO_REEMBOLSO } from '@/lib/documentos-legais';

export type StatusReembolso = 'solicitado' | 'aprovado' | 'pago' | 'recusado' | 'desistido';
export type FormaReembolso = 'pix' | 'cartao';
export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/** O pedido de reembolso de um ingresso, do jeito que Meus Ingressos precisa. */
export interface ReembolsoDoIngresso {
  id: string;
  numero: number;
  status: StatusReembolso;
  forma: FormaReembolso;
  valor_a_devolver: number;
  solicitado_em: string;
  decidido_em: string | null;
  pago_em: string | null;
  motivo_recusa: string | null;
}

export interface IngressoSimulado {
  ticket_id: string;
  codigo: string;
  titular: string | null;
  nome: string;
  /** Nulo = pode entrar no pedido. Preenchido = o código do porquê não pode. */
  motivo: string | null;
  valor_ingresso: number;
  valor_taxa: number;
}

export interface SimulacaoDeReembolso {
  permitido: boolean;
  motivo?: string;
  janela?: 'arrependimento' | 'ate_48h';
  devolve_taxa?: boolean;
  forma?: FormaReembolso;
  /** Até quando esta compra aceita pedido de reembolso (ISO). */
  limite?: string;
  mesa?: boolean;
  ingressos?: IngressoSimulado[];
  pedido_aberto?: { id: string; numero: number; solicitado_em: string } | null;
}

export interface RespostaDoPedido {
  ok: boolean;
  error?: string;
  reembolso_id?: string;
  numero?: number;
  valor_a_devolver?: number;
  forma?: FormaReembolso;
  limite?: string;
}

export const TIPOS_DE_CHAVE: { valor: TipoChavePix; rotulo: string; exemplo: string }[] = [
  { valor: 'cpf', rotulo: 'CPF', exemplo: '000.000.000-00' },
  { valor: 'telefone', rotulo: 'Celular', exemplo: '(17) 99999-9999' },
  { valor: 'email', rotulo: 'E-mail', exemplo: 'voce@exemplo.com' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória', exemplo: 'cole a chave aqui' },
  { valor: 'cnpj', rotulo: 'CNPJ', exemplo: '00.000.000/0000-00' },
];

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (n: unknown) => moeda.format(Number(n ?? 0));

/** "08/10 às 15h00", no fuso de Brasília. */
export function quandoBR(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora.replace(':', 'h')}`;
}

export async function simularReembolso(orderId: string): Promise<SimulacaoDeReembolso> {
  const { data, error } = await (supabase.rpc as any)('reembolso_simular', { _order_id: orderId });
  if (error) throw error;
  return data as SimulacaoDeReembolso;
}

export async function solicitarReembolso(p: {
  orderId: string;
  ticketIds: string[];
  chavePix?: string | null;
  tipoChavePix?: TipoChavePix | null;
  motivo?: string | null;
}): Promise<RespostaDoPedido> {
  const { data, error } = await (supabase.rpc as any)('reembolso_solicitar', {
    _order_id: p.orderId,
    _ticket_ids: p.ticketIds,
    _chave_pix: p.chavePix ?? null,
    _tipo_chave_pix: p.tipoChavePix ?? null,
    _motivo: p.motivo ?? null,
  });
  if (error) throw error;
  return data as RespostaDoPedido;
}

export async function desistirDoReembolso(reembolsoId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await (supabase.rpc as any)('reembolso_desistir', { _reembolso_id: reembolsoId });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}

const SUPORTE = `Fale com o suporte: ${IDENTIDADE_FESTPAG.email}.`;

/** Código do servidor → frase que o comprador entende. */
export function fraseDoMotivo(codigo?: string | null, limite?: string | null): string {
  switch (codigo) {
    case 'fora_do_prazo':
      return `O prazo para pedir o reembolso desta compra terminou${limite ? ` em ${quandoBR(limite)}` : ''}. ${RESUMO_REEMBOLSO.prazo}`;
    case 'compra_fora_do_site':
      return 'Esta compra não foi paga pelo site (foi feita direto com o organizador ou na portaria). Para cancelar, fale com o organizador do evento.';
    case 'pedido_com_produto':
      return `Esta compra inclui produtos da loja do evento, e o cancelamento dela é feito pelo atendimento. ${SUPORTE}`;
    case 'forma_de_pagamento_nao_suportada':
      return `Não conseguimos identificar a forma de pagamento desta compra. ${SUPORTE}`;
    case 'sem_valor_pago':
      return 'Esta compra não teve valor pago, então não há o que devolver.';
    case 'pedido_nao_esta_pago':
      return 'Esta compra não está mais ativa.';
    case 'mesa_indisponivel':
      return `A mesa só pode ser devolvida inteira, e um dos lugares já foi usado ou transferido. ${SUPORTE}`;
    case 'mesa_inteira':
      return 'A mesa só pode ser devolvida inteira: todos os lugares entram juntos no pedido.';
    case 'reembolso_em_analise':
      return 'Já existe um pedido de reembolso em análise para esta compra.';
    case 'limite_de_pedidos':
      return `Esta compra já teve vários pedidos de reembolso. ${SUPORTE}`;
    case 'pedido_nao_e_seu':
    case 'nao_autenticado':
      return 'Entre na conta que fez a compra para pedir o reembolso.';
    case 'chave_pix_invalida':
      return 'Informe a chave PIX em que você quer receber o valor.';
    case 'tipo_de_chave_invalido':
      return 'Escolha o tipo da chave PIX.';
    case 'nenhum_ingresso_escolhido':
      return 'Escolha pelo menos um ingresso.';
    case 'ingresso_indisponivel':
    case 'ingresso_invalido':
      return 'Um dos ingressos escolhidos não pode mais ser devolvido. Feche esta janela e tente de novo.';
    case 'reembolso_ja_respondido':
      return 'Este pedido já foi respondido e não pode mais ser desfeito.';
    default:
      return 'Não foi possível concluir agora. Tente de novo em instantes.';
  }
}

/** Por que um ingresso específico fica fora do pedido. */
export function fraseDoIngresso(motivo?: string | null): string {
  switch (motivo) {
    case 'ingresso_ja_utilizado': return 'Já usado na entrada';
    case 'ingresso_ja_cancelado': return 'Já cancelado';
    case 'ingresso_transferido': return 'Transferido para outra pessoa';
    case 'transferencia_em_andamento': return 'Em transferência. Cancele a transferência para poder devolver';
    case 'reembolso_em_analise': return 'Reembolso em análise';
    case 'abada_ja_retirado': return 'Abadá já retirado';
    default: return 'Não pode ser devolvido';
  }
}
