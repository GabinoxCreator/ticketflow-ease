// Cliente da API de pagamentos da FestPag (Marcel). Um lugar só para falar com
// ela, porque as armadilhas dela são sutis e repeti-las em cada edge é receita
// de erro caro — cobrança dupla, venda liberada sem pagamento.
//
// Documentação: API-PAGAMENTOS-INTEGRACAO.md (recebida em 17/08/2026).
//
// AS TRÊS REGRAS QUE A PRÓPRIA DOC DESTACA, E QUE ESTE ARQUIVO IMPÕE:
//   1. `aprovado:true` no /pix NÃO é pagamento — é "cobrança criada". Quem
//      liberar a venda ali entrega ingresso sem receber. Só /checkpix com
//      status "3" aprova.
//   2. Recusa chega com HTTP 200. Decidir SEMPRE pelo campo `aprovado`, nunca
//      pelo código HTTP.
//   3. Timeout e erro 500 NÃO significam recusa — a cobrança pode ter passado.
//      Refazer às cegas cobra o cliente duas vezes. Consultar antes.

const BASE_PADRAO = 'https://southamerica-east1-festpag-bea41.cloudfunctions.net/app';

export type StatusMarcel = '1' | '3' | '5' | '6' | '7';

/** Só "3" é pago. Qualquer outra coisa NÃO libera venda. */
export const PAGO = '3';

export interface RespostaPix {
  aprovado: boolean;
  transactionId?: number | string;
  transacaoId?: string;
  pixCode?: string;
  error?: string;
  message?: string;
}

export interface RespostaCredito {
  aprovado: boolean;
  transactionId?: number | string;
  transacaoId?: string;
  parcelas?: number;
  message?: string;
  authorizationCode?: string | null;
  error?: string;
  maxParcelas?: number;
  opcoes?: unknown;
}

export interface RespostaConsulta {
  aprovado: boolean;
  status?: StatusMarcel | string;
  message?: string;
  error?: string;
}

export class MarcelIndisponivel extends Error {
  constructor(msg: string) { super(msg); this.name = 'MarcelIndisponivel'; }
}

function config() {
  const base = Deno.env.get('MARCEL_PIX_BASE') || BASE_PADRAO;
  const apiKey = Deno.env.get('MARCEL_API_KEY');
  // A chave autoriza cobrança: é segredo de servidor e nunca vai para o cliente.
  // Sem ela a API responde 401 em TODAS as rotas — falhar aqui, claro, é melhor
  // que descobrir no meio de um checkout.
  if (!apiKey) throw new MarcelIndisponivel('MARCEL_API_KEY não configurada');
  return { base: base.replace(/\/+$/, ''), apiKey };
}

async function chamar<T>(
  caminho: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const { base, apiKey } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const resp = await fetch(`${base}${caminho}`, {
      method: init.method,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    // Devolve o corpo mesmo em não-2xx: a API usa 200 para recusa e 400 para
    // regra de negócio (parcelas acima do máximo), e os dois trazem dado útil.
    const texto = await resp.text();
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new MarcelIndisponivel(`resposta ilegível (HTTP ${resp.status})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Opções de parcelamento aceitas para um valor. NUNCA calcular isso na tela:
 *  a API recusa a venda inteira se a parcela ficar abaixo de R$5. */
export function parcelasAceitas(amount: number) {
  return chamar<{ ok: boolean; maxParcelas: number; minimoPorParcela: number; opcoes: unknown[] }>(
    `/parcelas?amount=${encodeURIComponent(amount.toFixed(2))}`,
    { method: 'GET' },
  );
}

/** Cria a cobrança PIX. ⚠️ `aprovado:true` aqui é só "cobrança criada". */
export function criarPix(input: {
  amount: number;
  description?: string;
  purchaseId: string;
  customer: { name?: string; cpf: string; email?: string; phone?: string };
}) {
  return chamar<RespostaPix>('/pix', {
    method: 'POST',
    body: {
      // Reais com centavos decimais (52.50), NUNCA em centavos.
      amount: Number(input.amount.toFixed(2)),
      description: input.description,
      // purchaseId é o que permite reconciliar depois. Mandar SEMPRE.
      purchaseId: input.purchaseId,
      customer: input.customer,
    },
  });
}

/** Consulta se o PIX foi pago. É a ÚNICA coisa que autoriza liberar a venda. */
export function consultarPix(transactionId: string | number) {
  return chamar<RespostaConsulta>('/checkpix', {
    method: 'POST',
    body: { transactionId: String(transactionId) },
  });
}

/** Cobra no crédito. `aprovado:false` com HTTP 200 é recusa do banco. */
export function cobrarCredito(input: {
  amount: number;
  parcelas: number;
  description?: string;
  purchaseId: string;
  card?: { holder: string; number: string; expiration: string; cvv: string };
  cartaoId?: string;
  customer: { name?: string; cpf: string; email?: string };
}) {
  return chamar<RespostaCredito>('/credit', {
    method: 'POST',
    body: {
      amount: Number(input.amount.toFixed(2)),
      parcelas: input.parcelas,
      description: input.description,
      purchaseId: input.purchaseId,
      ...(input.cartaoId ? { cartaoId: input.cartaoId } : { card: input.card }),
      customer: input.customer,
    },
    // Cartão demora mais que PIX: o banco entra no caminho.
    timeoutMs: 40_000,
  });
}

/** Reconfere uma venda que ficou em dúvida (queda de rede no meio da compra).
 *  Exige que o purchaseId tenha ido na cobrança original. */
export function reconciliar(purchaseId: string) {
  return chamar<RespostaConsulta>('/reconcile', {
    method: 'POST',
    body: { purchaseId },
  });
}

/**
 * Telefone no formato que a API aceita: DDD + número, SEM código de país.
 *
 * ⚠️ Descoberto em produção (18/08/2026), na primeira tentativa real de compra:
 * telefone com 13 dígitos (`5548999171313`) faz a API RECUSAR a cobrança, e o
 * cliente vê "erro na edge function" sem explicação. Com 11 (`48999171313`)
 * passa. A documentação mostra o exemplo sem o país — e muito cadastro do site
 * guarda o telefone COM o 55, então isso derrubaria parte das vendas.
 *
 * Devolve `undefined` quando não sobra um telefone plausível: o campo é
 * opcional na API, e mandar lixo é pior do que não mandar.
 */
export function telefoneParaMarcel(bruto: string | null | undefined): string | undefined {
  const d = String(bruto ?? '').replace(/\D/g, '');
  if (!d) return undefined;
  // 55 + DDD + 8 ou 9 dígitos → tira o país.
  const semPais = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
  // Sobrou algo com cara de DDD + número? Senão, melhor omitir.
  return (semPais.length === 10 || semPais.length === 11) ? semPais : undefined;
}
