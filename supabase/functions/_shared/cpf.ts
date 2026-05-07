// Shared CPF helpers for edge functions (mirror of src/utils/cpfValidator.ts).

export function unformatCPF(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

export function validateCPF(value: string | null | undefined): boolean {
  const digits = unformatCPF(value);
  if (digits.length !== 11) return false;

  const invalidCPFs = new Set([
    '00000000000', '11111111111', '22222222222', '33333333333',
    '44444444444', '55555555555', '66666666666', '77777777777',
    '88888888888', '99999999999',
  ]);
  if (invalidCPFs.has(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(digits[10])) return false;

  return true;
}
