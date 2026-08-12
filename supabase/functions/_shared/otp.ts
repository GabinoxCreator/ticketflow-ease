// Código OTP de 6 dígitos com CSPRNG — Math.random é previsível (o estado do
// gerador pode ser recuperado a partir de saídas observadas) e não serve para OTP.
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  // rejeita acima do maior múltiplo de 900000 ≤ 2^32 para não enviesar o módulo
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= 4_294_800_000);
  return (100000 + (buf[0] % 900000)).toString();
}
