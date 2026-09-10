/*
 * docCpf — o nome vem do CPF, e nunca volta para a tela.
 *
 * Decisão do Gabriel, 10/09/2026: *"sobre o nome, nem precisa aparecer, deixa
 * livre, a gente só segue o que está vindo do CPF."* Então o cadastro não tem
 * mais campo de nome: a pessoa digita o CPF, o servidor busca o nome no
 * registro e grava. Ninguém digita, ninguém confere, ninguém é recusado.
 *
 * Como se chegou aqui, em três voltas:
 *   1. Até 10/09 a edge pública `auth-identificar` DEVOLVIA o primeiro nome do
 *      dono de qualquer CPF sem conta. Qualquer um digitava um CPF de qualquer
 *      brasileiro e recebia o nome. Isso saiu (Doca 88).
 *   2. A primeira ideia de substituto foi conferir o nome digitado contra o
 *      registro, respondendo só confere/não confere. Morreu porque recusava
 *      gente real: pessoa trans que digita o nome social, e sobrenome de casada
 *      quando o registro tem o de solteira.
 *   3. Esta versão. O nome não passa pelo navegador em momento nenhum — nem de
 *      ida nem de volta. É a única forma que não vaza e não exclui ninguém.
 *
 * ⚠️ O nome NUNCA vai para a resposta de uma edge pública. Ele sai daqui e vai
 * direto para o `user_metadata` da conta que está sendo criada. Quem mexer
 * aqui: devolver o nome numa resposta reabre o vazamento do item 88.
 */

export type BuscaCpf =
  | { situacao: 'ok'; nome: string }
  | { situacao: 'nao_encontrado' }
  | { situacao: 'indisponivel' };

/** Só os 3 últimos dígitos vão para o log — nunca o CPF inteiro, nunca o nome. */
const cauda = (d: string) => (d.length >= 3 ? `***${d.slice(-3)}` : '***');

/** Espaços sobrando fora; é o que vai para o cadastro e para o ingresso. */
const arrumar = (nome: string) => nome.trim().replace(/\s+/g, ' ');

/**
 * Busca o nome do dono do CPF no registro.
 *
 * `indisponivel` e `nao_encontrado` NÃO barram o cadastro: quem chama pergunta
 * o nome à pessoa nesse caso. Perder venda porque um terceiro caiu seria trocar
 * um problema por outro pior.
 */
export async function buscarNomePeloCpf(cpf: string): Promise<BuscaCpf> {
  const base = Deno.env.get('MARCEL_DOC_BASE');
  if (!base) return { situacao: 'indisponivel' };
  try {
    const resp = await fetch(`${base}/cpf?ni=${cpf}`, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return { situacao: 'indisponivel' };
    const data = await resp.json();
    // `aprovado` = "achei o documento", não "está regular".
    if (data?.aprovado !== true) return { situacao: 'nao_encontrado' };
    const nome = typeof data?.nome === 'string' ? arrumar(data.nome) : '';
    if (!nome) return { situacao: 'nao_encontrado' };
    console.log('[DOC-CPF] nome encontrado para', cauda(cpf));
    return { situacao: 'ok', nome };
  } catch {
    console.warn('[DOC-CPF] consulta falhou', cauda(cpf));
    return { situacao: 'indisponivel' };
  }
}
