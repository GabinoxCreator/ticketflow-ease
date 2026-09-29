/*
 * cadastroEmCurso — "a pessoa acabou de criar a conta e ainda não respondeu ao
 * convite da facial". Enquanto isso for verdade, NINGUÉM a leva embora sozinho.
 *
 * Por que isto existe, e por que não é estado de componente:
 *
 * O convite da facial sumiu do site por 18 dias (01 a 28/09/2026 — 152 contas,
 * zero rostos). A correção de 25/09 blindou o `FluxoConta` por dentro, olhando a
 * etapa em que ele estava. Não pegou, e a medição de 28/09 mostrou por quê: no
 * instante em que a sessão nasce, o `FluxoConta` é DESMONTADO e montado de novo
 * do zero. A etapa volta para 'cpf', o ref da trava volta para false — a
 * blindagem existia, mas morreu junto com o componente.
 *
 * (Quem desmontava, na compra: a lista de lotes tem o usuário na chave do cache,
 * então logar troca a chave, a página acha que está carregando e devolve o
 * spinner no lugar da árvore inteira. Isso foi corrigido em `useEventLots`. Esta
 * peça é a rede embaixo: mesmo que amanhã outra tela pisque por outro motivo, o
 * convite continua de pé.)
 *
 * Mora fora do React de propósito: o módulo sobrevive ao remount do componente,
 * e o `sessionStorage` sobrevive até a um F5. Validade curta para o marcador não
 * ficar preso em quem já terminou.
 */
const CHAVE = 'festpag_cadastro_facial';
const VALIDADE_MS = 10 * 60 * 1000;

/** Espelho em memória: o remount perde o componente, não o módulo. */
let emMemoria: number | null = null;

export function marcarCadastroEmCurso(): void {
  emMemoria = Date.now();
  try {
    sessionStorage.setItem(CHAVE, String(emMemoria));
  } catch {
    /* navegador com storage bloqueado: o espelho em memória basta para o remount */
  }
}

export function cadastroEmCurso(): boolean {
  let quando = emMemoria;
  if (quando === null) {
    try {
      const guardado = sessionStorage.getItem(CHAVE);
      if (guardado) quando = Number(guardado) || null;
    } catch {
      /* idem */
    }
  }
  if (quando === null) return false;
  if (Date.now() - quando > VALIDADE_MS) {
    limparCadastroEmCurso();
    return false;
  }
  return true;
}

export function limparCadastroEmCurso(): void {
  emMemoria = null;
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}
