// avisarGestao — manda um aviso para o painel e para o celular da equipe.
//
// POR QUE EXISTE (18/08/2026): a decisão do Gabriel é que contestação de cartão
// **não devolve a vaga sozinha** — vai para análise humana. Só que até aqui
// "análise humana" era uma linha de log que ninguém lê: o webhook registrava
// `action_required: manual_inventory_review` e o caso morria ali. É o mesmo
// buraco do e-mail que ficou um mês fora do ar sem ninguém perceber.
//
// Agora o aviso chega onde a pessoa está: no sino do painel e no push do app da
// FestPag. Do outro lado, a edge `alerta-produtos` da gestão só insere o aviso;
// quem dispara o push é o gatilho de lá.
//
// REGRA DE OURO: NUNCA LANÇA. Isto roda no meio de um fluxo de dinheiro. Falha
// ao avisar é perda de aviso — grave, mas menor que derrubar o tratamento de um
// estorno por causa dela. Todo erro vira log.

const log = (step: string, d?: unknown) =>
  console.log(`[AVISAR-GESTAO] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

export interface AvisoParaGestao {
  /** 'contestacao' | 'estorno' | 'pagamento' — decide quem recebe do outro lado. */
  tipo: string;
  titulo: string;
  mensagem?: string;
  /** Id do pedido, para quem for analisar achar o caso. */
  referencia?: string;
}

export async function avisarGestao(aviso: AvisoParaGestao): Promise<boolean> {
  try {
    const base = Deno.env.get('GESTAO_ALERTA_URL');
    const key = Deno.env.get('GESTAO_ALERTA_KEY');
    if (!base || !key) {
      // Sem configuração o aviso não sai — e isso PRECISA aparecer no log, senão
      // a equipe acha que está sendo avisada quando não está.
      log('SEM CONFIGURAÇÃO — aviso não enviado', { tipo: aviso.tipo, referencia: aviso.referencia });
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...aviso, origem: 'site-ingressos' }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        log('Gestão recusou o aviso', { status: resp.status, referencia: aviso.referencia });
        return false;
      }
      log('Aviso entregue', { tipo: aviso.tipo, referencia: aviso.referencia });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    log('Falha ao avisar (não fatal)', { msg: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
