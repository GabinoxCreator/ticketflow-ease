// Shared CNPJ helpers for edge functions (espelho de src/utils/cnpjValidator.ts).
// Gêmeo de cpf.ts — mesmo formato, mesma disciplina: só dígitos, valida os dois DVs.

export function unformatCNPJ(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

export function validateCNPJ(value: string | null | undefined): boolean {
  const digits = unformatCNPJ(value);
  if (digits.length !== 14) return false;

  // Sequências repetidas passam na conta dos DVs, então são barradas na mão.
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDV = (len: number): number => {
    // Pesos vão de 2 a 9, ciclicamente, da direita para a esquerda.
    let sum = 0;
    let weight = len - 7;
    for (let i = 0; i < len; i++) {
      sum += parseInt(digits[i]) * weight;
      weight -= 1;
      if (weight < 2) weight = 9;
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  if (calcDV(12) !== parseInt(digits[12])) return false;
  if (calcDV(13) !== parseInt(digits[13])) return false;

  return true;
}
