// Data de nascimento no cadastro de produtor pessoa física (OS-339, 28/10/2026).
// A consulta de CPF da base oficial (API do Marcel) passou a exigir a data de
// nascimento junto do CPF. A pessoa digita dd/mm/aaaa; a consulta recebe
// 'aaaa-mm-dd'. A data serve só para a consulta: não é gravada em lugar nenhum.
// Mesmo jeito do cadastro do FaceCashless (festpay `src/lib/nascimento.ts`).

const soDigitos = (value: string) => value.replace(/\D/g, '');

/** Máscara dd/mm/aaaa enquanto a pessoa digita. */
export function maskNascimento(value: string): string {
  const d = soDigitos(value).slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd', ou null se a data não existe, é futura ou antes de 1900. */
export function nascimentoParaIso(value: string): string | null {
  const d = soDigitos(value);
  if (d.length !== 8) return null;
  const dia = Number(d.slice(0, 2));
  const mes = Number(d.slice(2, 4));
  const ano = Number(d.slice(4));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  if (ano < 1900 || data.getTime() > Date.now()) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** A data já tem os 8 números (para só então dizer que está errada). */
export function nascimentoCompleto(value: string): boolean {
  return soDigitos(value).length === 8;
}
