// captureSaleTerms — grava, no ato da venda, o que hoje o sistema JOGA FORA:
// o valor de face por linha de lote e as condicoes de credito (parcelas + bandeira).
//
// POR QUE ISTO EXISTE
// A regra de repasse do Rodeio (framework §6) precisa de face, lote, parcelas e bandeira.
// Nada disso e recuperavel depois: `event_lots.price` e `event_lots.name` sao MUTAVEIS
// (o produtor edita e o passado muda junto) e o numero de parcelas nunca foi persistido
// -- so existia no request e no provedor. Ver _docs/investigacao-juro-parcelamento-repasse.md.
//
// REGRA DE OURO: NUNCA LANCA.
// Isto roda depois do pedido ja criado e pago. Uma falha aqui e perda de dado de
// conferencia, nao perda de venda -- e derrubar uma compra por causa disso seria trocar
// um problema pequeno por um grande. Todo caminho de erro vira console.warn.
// A rede de seguranca e a conferencia periodica: pedido pago sem linha aqui aparece
// no relatorio de sanidade, e o motor de repasse (setembro) falha FECHADO nesses casos
// em vez de pagar errado em silencio.

export interface FaceLine {
  lotId: string | null;
  lotName: string;
  unitFace: number;
  quantity: number;
  modoTaxa: string;
}

export interface CreditTerms {
  installments?: number | null;
  brandRaw?: string | null;
  provider: string;             // 'mercadopago' | 'marcel' | 'pos' | 'manual' | 'courtesy'
  method: string;               // 'card' | 'pix' | 'cash' | 'courtesy'
}

// Agrupa a bandeira nas 3 faixas da tabela de taxas (§6). Bandeira desconhecida vira
// null DE PROPOSITO: o motor de repasse precisa saber que nao sabe, em vez de chutar a
// faixa mais barata. `brand_raw` guarda o valor cru para reprocessar se o mapa mudar.
export function groupBrand(raw: unknown): string | null {
  const b = String(raw ?? '').trim().toLowerCase();
  if (!b) return null;
  if (['visa', 'master', 'mastercard', 'maestro', 'visa_debit', 'debvisa', 'debmaster'].includes(b)) return 'visa_master';
  if (['elo', 'diners', 'discover', 'debelo'].includes(b)) return 'elo_diners';
  if (['amex', 'american_express', 'hipercard', 'hiper', 'jcb'].includes(b)) return 'amex_hiper';
  return null;
}

const log = (event: string, data: Record<string, unknown>) => {
  try {
    console.warn(JSON.stringify({ scope: 'capture_sale', event, ...data }));
  } catch {
    console.warn(`[capture_sale] ${event}`);
  }
};

/**
 * Grava face por linha + condicoes de credito do pedido. Best-effort, nunca lanca.
 * `client` precisa ser service-role (as tabelas nao tem policy nenhuma, de proposito).
 */
export async function captureSaleTerms(
  client: any,
  orderId: string,
  lines: FaceLine[],
  terms: CreditTerms,
): Promise<void> {
  try {
    if (!orderId) return;

    // 1) Linhas de face. Uma por lote do carrinho, com nome/preco/elegibilidade CONGELADOS.
    if (Array.isArray(lines) && lines.length > 0) {
      const rows = lines.map((l) => ({
        order_id: orderId,
        lot_id: l.lotId ?? null,
        lot_name: String(l.lotName ?? '').slice(0, 200),
        unit_face: Number(l.unitFace) || 0,
        quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)),
        modo_taxa: l.modoTaxa === 'absorve' ? 'absorve' : 'cliente_paga',
      }));
      const { error } = await client.from('order_line_face').insert(rows);
      if (error) log('face_insert_failed', { orderId, code: error.code, message: String(error.message).slice(0, 200) });
    }

    // 2) Condicoes de credito. PIX/dinheiro tambem gravam (installments=1) -- se so cartao
    //    gravasse, a conferencia de completude acusaria erro para sempre num evento onde
    //    PIX e maioria.
    const n = Math.trunc(Number(terms.installments ?? 1));
    const { error: e2 } = await client.from('order_credit_terms').upsert({
      order_id: orderId,
      installments: Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1,
      brand_raw: terms.brandRaw ? String(terms.brandRaw).slice(0, 40) : null,
      brand_group: groupBrand(terms.brandRaw),
      provider: String(terms.provider ?? 'desconhecido').slice(0, 30),
      method: String(terms.method ?? 'desconhecido').slice(0, 20),
    }, { onConflict: 'order_id' });
    if (e2) log('terms_insert_failed', { orderId, code: e2.code, message: String(e2.message).slice(0, 200) });
  } catch (err) {
    log('capture_threw', { orderId, message: String((err as { message?: string })?.message ?? err).slice(0, 200) });
  }
}
