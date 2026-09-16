// O motivo de um pagamento de cartão que NÃO passou, num texto só, para gravar
// em `orders.mp_status_detail` (a coluna nasceu no Mercado Pago e é a mesma que
// a rota do Marcel já usava para isso).
//
// ⚠️ Por que existe (16/09/2026): numa semana, 10 cartões recusados ficaram no
// banco como `failed` SEM motivo nenhum. O motivo só era gravado quando a
// resposta trazia `transactionId` — e a recusa que acontece ANTES de a
// transação existir (dado do cartão, antifraude, regra da API) vem sem ele.
// Os caminhos de erro também marcavam `failed` calados. Resultado: "não
// consegui pagar" virava adivinhação, que é exatamente o que o conserto de
// 18/08 (caso Ana Paula) queria acabar.
//
// O prefixo separa o que importa numa reclamação:
//   recusa       → o provedor respondeu "não" (problema do cartão/cliente/antifraude)
//   indisponivel → não conseguimos falar com o provedor (problema do caminho)
//   erro         → quebrou do nosso lado (problema nosso)
//
// Nunca entra dado do cartão aqui — só o que o provedor ou a exceção disseram.

export type OrigemDaFalha = 'recusa' | 'indisponivel' | 'erro';

const LIMITE = 500;

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

export function motivoDaFalha(
  origem: OrigemDaFalha,
  partes: { codigo?: unknown; mensagem?: unknown },
): string {
  const codigo = texto(partes.codigo);
  const mensagem = texto(partes.mensagem);
  // Código e mensagem juntos: antes gravava `message ?? error`, e quando os
  // dois vinham o código se perdia.
  const corpo = [codigo, mensagem !== codigo ? mensagem : null].filter(Boolean).join(' · ');
  return `${origem} · ${corpo || 'sem motivo na resposta'}`.slice(0, LIMITE);
}
