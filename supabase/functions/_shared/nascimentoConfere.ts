// A data de nascimento que a pessoa digitou bate com a que a base de CPF devolveu?
// (OS-343, revisão 1, 30/10/2026)
//
// A edge `document-lookup` manda a data junto com o CPF (OS-339), mas não se sabe se
// a base confere a data ou só ignora o parâmetro. Por isso a conferência é NOSSA:
// a base devolve o campo `nascimento` e comparamos aqui. A data da base nunca sai da
// edge; a resposta diz só confere (true), não confere (false) ou não deu para saber
// (null: a base não devolveu data, ou devolveu num formato que não reconhecemos).
//
// Formatos aceitos do lado da base: 'dd/mm/aaaa', 'aaaa-mm-dd' e 'aaaa-mm-ddThh:mm...'.
// Nomes aceitos do campo: `nascimento`, `dataNascimento` e `data_nascimento`.
// A digitada chega sempre em 'aaaa-mm-dd' (a edge já conferiu).

function paraIso(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (t.length >= 10 && t[4] === '-' && t[7] === '-') {
    const iso = t.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  if (t.length === 10 && t[2] === '/' && t[5] === '/') {
    const [dia, mes, ano] = t.split('/');
    const iso = `${ano}-${mes}-${dia}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  return null;
}

/**
 * `dadosDaBase` é o corpo que a base devolveu. A data pode vir em `nascimento`,
 * `dataNascimento` ou `data_nascimento` (os mesmos três nomes que o
 * `totem-lookup-cpf` do totem lê).
 */
export function nascimentoConfere(dadosDaBase: unknown, digitada: string): boolean | null {
  const d = (dadosDaBase && typeof dadosDaBase === 'object') ? dadosDaBase as Record<string, unknown> : {};
  const base = paraIso(d.nascimento ?? d.dataNascimento ?? d.data_nascimento);
  if (!base) return null;
  return base === digitada;
}
