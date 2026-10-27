/*
 * Textos que o cliente lê na Minha Conta sobre "quem é a pessoa" (OS-322:
 * OS-302 primeiro CPF e OS-303 aviso para confirmar o e-mail).
 *
 * ⚠️ PROPOSTA, ESPERANDO O OK DO GABRIEL (26/10/2026). Texto que cliente lê é
 * decisão dele: estes são os textos propostos pelo chat, construídos já no
 * lugar para a tela poder ser conferida. Se ele mudar alguma frase, é só
 * trocar aqui; nenhum outro arquivo repete estes textos.
 */
export const TEXTOS_CONTA = {
  // OS-302: o CPF digitado já está em outra conta (definir_meu_cpf responde 'cpf_de_outra_conta').
  cpfDeOutraConta:
    'Este CPF já está em outra conta da FestPag. Se ele é seu, entre por aquela conta ou fale com o suporte.',
  // OS-302: tentativas demais de gravar o primeiro CPF (definir_meu_cpf responde 'muitas_tentativas').
  cpfMuitasTentativas: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
} as const;
