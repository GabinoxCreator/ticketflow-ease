// O que as duas edges de MESA da rota do Marcel (`marcel-create-seat-pix` e
// `marcel-charge-seat-card`) fazem igual: identificar o comprador, ler a taxa do
// evento, abrir o pedido pela RPC de assentos e desfazer quando a cobrança não
// acontece.
//
// As edges equivalentes do Mercado Pago (`create-seat-pix`, `charge-seat-card`)
// repetem esse bloco inteiro uma na outra — inclusive o mapa de erros, copiado
// com uma diferença silenciosa: no PIX `order_already_in_progress` é tratado
// como retomada e no cartão como manipulação. Aqui isso vive num lugar só.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "./cpf.ts";

export const corsMesa = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const jsonMesa = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsMesa, 'Content-Type': 'application/json' },
  });

/** Taxa administrativa padrão quando o evento não tem regra própria. Mesmo
 *  número das edges do Mercado Pago — mudar aqui sem mudar lá faria a mesma
 *  mesa custar diferente conforme o provedor. */
export const TAXA_PADRAO_PCT = 10;

export interface AssentoPedido { seatId: string; addons?: number }

/** Erro de negócio com código que a tela sabe traduzir. */
export class MesaInvalida extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 409, msg?: string) {
    super(msg ?? code);
    this.name = 'MesaInvalida';
    this.code = code;
    this.status = status;
  }
}

/**
 * Traduz o erro cru da RPC de assentos.
 *
 * `honest` = o cliente causou sem querer (a reserva venceu, alguém pegou antes):
 * merece mensagem clara. `manipulation` = só se alcança adulterando o pedido
 * (assento de outra pessoa, adicionais acima do limite): resposta genérica, para
 * não ensinar o caminho a quem está testando.
 */
export function traduzirErroDeAssento(bruto: string): {
  code: string;
  kind: 'honest' | 'manipulation' | 'already_in_progress' | 'unknown';
} {
  const m = (bruto || '').toLowerCase();
  if (m.includes('hold_expired')) return { code: 'hold_expired', kind: 'honest' };
  if (m.includes('seat_not_held')) return { code: 'seat_not_held', kind: 'honest' };
  if (m.includes('seat_not_found')) return { code: 'seat_not_found', kind: 'honest' };
  if (m.includes('order_already_in_progress')) return { code: 'order_already_in_progress', kind: 'already_in_progress' };
  if (m.includes('addons_exceed_max')) return { code: 'addons_exceed_max', kind: 'manipulation' };
  if (m.includes('seat_not_yours')) return { code: 'seat_not_yours', kind: 'manipulation' };
  if (m.includes('invalid_hold_token')) return { code: 'invalid_hold_token', kind: 'manipulation' };
  return { code: 'create_seat_order_failed', kind: 'unknown' };
}

/** Resposta HTTP para um erro de assento, já com a distinção honesto × manipulação. */
export function respostaDeErroDeAssento(code: string, kind: string) {
  if (kind === 'manipulation' || kind === 'unknown') {
    return jsonMesa({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, 422);
  }
  return jsonMesa({ error: code }, 409);
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

/**
 * Quem está comprando. Mesa NÃO aceita compra anônima: o assento é preso ao
 * usuário (`held_by_user_id`) desde o mapa, e é por ele que a RPC confere se a
 * reserva é mesmo daquela pessoa. Sem usuário não há o que validar.
 */
export async function exigirUsuario(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new MesaInvalida('unauthorized', 401);
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !data?.user?.id) throw new MesaInvalida('unauthorized', 401);
  return data.user.id;
}

export function exigirCpfValido(bruto: unknown): string {
  const limpo = unformatCPF(String(bruto ?? ''));
  if (!validateCPF(limpo)) throw new MesaInvalida('invalid_cpf', 400, 'CPF inválido. Verifique e tente novamente.');
  return limpo;
}

export async function eventoPublicado(admin: any, eventId: string) {
  const { data: event } = await admin
    .from('events').select('id, title, status, payment_provider').eq('id', eventId).maybeSingle();
  if (!event) throw new MesaInvalida('event_not_found', 404);
  if (event.status !== 'published') throw new MesaInvalida('event_not_available', 409);
  return event as { id: string; title: string; status: string; payment_provider: string | null };
}

/** Taxa administrativa do evento para o método. Fonte única: a mesma RPC que as
 *  edges do Mercado Pago usam. */
export async function taxaDoEvento(admin: any, eventId: string, metodo: 'pix' | 'card') {
  const { data } = await admin.rpc('get_event_fee', { _event_id: eventId, _method: metodo });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    percent: row?.fee_percent != null ? Number(row.fee_percent) : TAXA_PADRAO_PCT,
    fixed: row?.fee_fixed != null ? Number(row.fee_fixed) : 0,
  };
}

export function assentosParaRpc(seats: AssentoPedido[]) {
  return seats.map((s) => ({ seat_id: s.seatId, addons: Math.max(0, Number(s.addons || 0)) }));
}

/** Quanto custa esta reserva, sem criar nada. */
export async function cotarMesa(admin: any, args: {
  eventId: string; userId: string; holdToken: string; seats: AssentoPedido[];
  metodo: 'pix' | 'card';
}): Promise<{ subtotal: number; taxaAdministrativa: number; total: number }> {
  const taxa = await taxaDoEvento(admin, args.eventId, args.metodo);
  const { data, error } = await admin.rpc('quote_seat_total', {
    _event_id: args.eventId,
    _user_id: args.userId,
    _hold_token: args.holdToken,
    _seats: assentosParaRpc(args.seats),
    _fee_percent: taxa.percent,
    _fee_fixed: taxa.fixed,
  });
  if (error) {
    const t = traduzirErroDeAssento(error.message || '');
    throw new MesaInvalida(t.code, t.kind === 'honest' ? 409 : 422);
  }
  return {
    subtotal: Number(data.subtotal),
    taxaAdministrativa: Number(data.service_fee),
    total: Number(data.total),
  };
}

/** Abre o pedido e prende os assentos. Devolve também o vencimento da reserva,
 *  que é o relógio que a tela mostra. */
export async function abrirPedidoDeMesa(admin: any, args: {
  eventId: string; userId: string; holdToken: string; seats: AssentoPedido[];
  customerName: string; customerEmail: string; customerCpf: string; customerPhone?: string | null;
  metodo: 'pix' | 'card'; janela: string;
}): Promise<{ orderId: string; subtotal: number; taxaAdministrativa: number; total: number; holdExpiresAt: string | null }> {
  const taxa = await taxaDoEvento(admin, args.eventId, args.metodo);
  const { data, error } = await admin.rpc('create_seat_order', {
    _event_id: args.eventId,
    _user_id: args.userId,
    _hold_token: args.holdToken,
    _seats: assentosParaRpc(args.seats),
    _fee_percent: taxa.percent,
    _fee_fixed: taxa.fixed,
    _customer_name: args.customerName,
    _customer_email: args.customerEmail,
    _customer_cpf: args.customerCpf,
    _customer_phone: args.customerPhone || null,
    _payment_method: args.metodo,
    _window: args.janela,
  });
  if (error) {
    const t = traduzirErroDeAssento(error.message || '');
    throw new MesaInvalida(t.code, t.kind === 'honest' ? 409 : 422);
  }
  const orderId = data.order_id as string;
  return {
    orderId,
    subtotal: Number(data.subtotal),
    taxaAdministrativa: Number(data.service_fee),
    total: Number(data.total),
    holdExpiresAt: await vencimentoDaReserva(admin, orderId),
  };
}

/** O `hold_expires_at` que vale é o do banco, já estendido para a janela do
 *  método — a tela não pode inventar esse relógio. Falha aqui não derruba a
 *  venda: sem o valor a tela usa o próprio prazo do pagamento. */
export async function vencimentoDaReserva(admin: any, orderId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('event_seats').select('hold_expires_at').eq('order_id', orderId);
    const datas = (data ?? []).map((r: any) => r.hold_expires_at).filter(Boolean).sort();
    return datas.length ? datas[datas.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Desfaz o pedido quando a cobrança NÃO aconteceu.
 *
 * ⚠️ Só chamar com veredito EXPLÍCITO de que não houve cobrança (a API recusou,
 * ou nem chegou a criar). Em dúvida — timeout, resposta ilegível — NÃO desfazer:
 * a cobrança pode ter passado, e soltar a mesa aqui a colocaria à venda de novo
 * com o cliente já cobrado. Nesse caso a varredura resolve.
 */
export async function desfazerPedidoDeMesa(admin: any, orderId: string, motivo: string) {
  try {
    await admin.from('orders')
      .update({ status: 'failed', expires_at: new Date().toISOString() })
      .eq('id', orderId).eq('status', 'pending');
    await admin.from('tickets')
      .update({ status: 'cancelled' })
      .eq('order_id', orderId).eq('status', 'pending');
    // Estado primeiro, inventário depois — inverter reabre a porta para dois
    // compradores levarem a mesma mesa.
    await admin.rpc('release_seats_for_order', { _order_id: orderId });
  } catch (e) {
    console.log(`[MESA-MARCEL] falha ao desfazer pedido ${orderId} (${motivo}): ${String(e)}`);
  }
}
