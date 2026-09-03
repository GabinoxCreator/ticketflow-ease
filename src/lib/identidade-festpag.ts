/**
 * Identidade jurídica da FestPag — FONTE ÚNICA para as páginas públicas.
 *
 * Todo lugar do site que diz "quem é a empresa por trás da plataforma" lê daqui:
 * rodapé, Termos de Uso, Política de Reembolso e Política de Privacidade.
 * Se a empresa mudar de novo, muda-se este arquivo e só ele.
 *
 * Espelha o bloco CONTRATADA dos contratos da gestão
 * (`festpag-admin-hub` · `src/lib/commercial-templates.ts`) — site e contrato
 * têm que contar a mesma história.
 *
 * ⛔ Este arquivo NÃO tem relação com o CNPJ configurado nos aplicativos do
 * totem e da maquininha (`CNPJ_CPF` / `CNPJ_FACILITADOR` do SiTef). Aquele
 * número é o credenciamento junto à adquirente, não é texto de tela.
 */

export const IDENTIDADE_FESTPAG = {
  /** Nome de fantasia / marca sob a qual o serviço é oferecido. */
  marca: "FestPag",
  /** Razão social da empresa que opera a plataforma. */
  razaoSocial: "FESTPAG EVENTOS LTDA",
  /** CNPJ formatado, do jeito que aparece na tela. */
  cnpj: "68.425.626/0001-83",
  /** Canal oficial de atendimento (suporte e titular de dados, LGPD). */
  email: "suporte@festpag.digital",
} as const;

/** "FESTPAG EVENTOS LTDA — CNPJ: 68.425.626/0001-83" */
export const razaoSocialComCnpj = () =>
  `${IDENTIDADE_FESTPAG.razaoSocial} — CNPJ: ${IDENTIDADE_FESTPAG.cnpj}`;
