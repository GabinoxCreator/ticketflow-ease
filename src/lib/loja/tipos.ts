/**
 * Loja do produtor: tipos e acesso ao banco.
 *
 * As tabelas da loja (migration 20260930120000_loja_do_produtor.sql) ainda não
 * estão em `src/integrations/supabase/types.ts`, que é gerado e não se edita à
 * mão. Até o arquivo ser regerado, todo acesso passa por `lojaDb` / `lojaDbPublico`
 * e os formatos das linhas moram aqui, num lugar só.
 */
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lojaDb = supabase as any;
/** Leitura pública (vitrine do evento). Nunca usar para dado privado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lojaDbPublico = supabasePublic as any;

export type TipoDeProduto = 'camiseta' | 'copo' | 'outro';
export type EstadoNaLoja = 'draft' | 'active' | 'paused';
export type ModoTaxaProduto = 'herda' | 'cliente_paga' | 'absorve';
export type FormaDeEntrega = 'retirada_evento' | 'retirada_antes' | 'entrega';

export interface ProdutoDoCatalogo {
  id: string;
  producer_id: string;
  kind: TipoDeProduto;
  name: string;
  color: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VarianteDoProduto {
  id: string;
  product_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProdutoNoEvento {
  id: string;
  event_id: string;
  product_id: string;
  price: number | null;
  modo_taxa: ModoTaxaProduto;
  fulfillment: FormaDeEntrega | null;
  fulfillment_info: string | null;
  status: EstadoNaLoja;
  sort_order: number;
}

export interface EstoqueDoProduto {
  id: string;
  event_product_id: string;
  /** Nulo = estoque único do produto (o tamanho é escolha, não limite). */
  variant_id: string | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity: number;
  is_active: boolean;
}

export interface ComboDoEvento {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  status: EstadoNaLoja;
  sort_order: number;
  /** Imagem própria do combo (o que vem nele). Vazio = usa a foto de um produto. */
  image_url: string | null;
}

export interface ItemDoCombo {
  id: string;
  bundle_id: string;
  kind: 'lot' | 'product';
  lot_id: string | null;
  event_product_id: string | null;
  quantity: number;
  /** Quanto do preço do combo cabe a esta linha. A soma tem de dar o preço. */
  unit_face_share: number;
}

export interface ItemDeProdutoDoPedido {
  id: string;
  order_id: string;
  event_product_id: string;
  variant_id: string | null;
  bundle_id: string | null;
  quantity: number;
  unit_face: number;
  label_snapshot: string | null;
  stock_state: 'reserved' | 'sold' | 'released' | 'returned';
}

export interface ComprovanteDeRetirada {
  id: string;
  order_id: string;
  event_id: string;
  claim_code: string;
  status: 'pending' | 'picked_up' | 'cancelled';
  picked_up_at: string | null;
  picked_up_by_name: string | null;
  created_at: string;
}

/** Grade padrão de camiseta, na ordem em que aparece na tela. */
export const GRADE_CAMISETA = ['PP', 'P', 'M', 'G', 'GG', 'EG'] as const;

export const NOME_DA_ENTREGA: Record<FormaDeEntrega, string> = {
  retirada_evento: 'Retirada no dia do evento',
  retirada_antes: 'Retirada antes do evento',
  entrega: 'Entrega combinada com o organizador',
};

/** Chaves devolvidas pela RPC `event_product_pendencias`, em português. */
export const NOME_DA_PENDENCIA: Record<string, string> = {
  preco: 'Definir o preço',
  foto: 'Colocar uma foto no cadastro do produto',
  como_entrega: 'Escolher como o comprador recebe',
  estoque: 'Informar a quantidade disponível',
  estoque_incompleto: 'Preencher a quantidade de todos os tamanhos (ou tirar o tamanho deste evento)',
  produto_nao_encontrado: 'Produto não encontrado',
};

/** Quantas unidades ainda podem ser vendidas desta linha de estoque. */
export function disponivel(e: Pick<EstoqueDoProduto, 'total_quantity' | 'sold_quantity' | 'reserved_quantity'>): number {
  return Math.max(0, e.total_quantity - e.sold_quantity - e.reserved_quantity);
}

/** "Camiseta branca": nome que o comprador lê. */
export function nomeDoProduto(p: Pick<ProdutoDoCatalogo, 'name' | 'color'>): string {
  return [p.name, p.color].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Painel do produtor: linhas já com os vínculos que as telas leem juntos.
// ---------------------------------------------------------------------------

export interface ProdutoDoCatalogoComGrade extends ProdutoDoCatalogo {
  variants: VarianteDoProduto[];
}

export interface ProdutoNoEventoCompleto extends ProdutoNoEvento {
  product: ProdutoDoCatalogoComGrade;
  stock: EstoqueDoProduto[];
}

export interface ComboCompleto extends ComboDoEvento {
  items: ItemDoCombo[];
}

export interface ComprovanteCompleto extends ComprovanteDeRetirada {
  order: { customer_name: string | null; customer_cpf: string | null } | null;
}

export const NOME_DO_TIPO: Record<TipoDeProduto, string> = {
  camiseta: 'Camiseta',
  copo: 'Copo',
  outro: 'Outro',
};

export const NOME_DO_ESTADO: Record<EstadoNaLoja, string> = {
  draft: 'Rascunho',
  active: 'À venda',
  paused: 'Pausado',
};

/** "R$ 67,00". */
export function reais(valor: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

/** Lê o que o produtor digitou ("67,50" ou "67.50"). Vazio ou inválido = null. */
export function lerValor(texto: string): number | null {
  const limpo = (texto ?? '').toString().trim().replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Dinheiro em centavos inteiros, para comparar sem erro de casa decimal. */
export function centavos(valor: number | null | undefined): number {
  return Math.round((Number(valor) || 0) * 100);
}

/** "***.456.789-**": o balcão confere a pessoa sem a tela expor o CPF inteiro. */
export function mascararCpf(cpf: string | null | undefined): string {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return '';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Variações na ordem em que aparecem na tela. */
export function ordenarVariantes(variantes: VarianteDoProduto[] | null | undefined): VarianteDoProduto[] {
  return [...(variantes ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}
