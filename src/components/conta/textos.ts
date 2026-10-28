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

  // OS-303: aviso no topo da Minha Conta, para conta sem nenhum contato confirmado.
  avisoTitulo: 'Confirme o seu e-mail',
  avisoTituloSemEmail: 'Adicione o seu e-mail',
  avisoComEmail:
    'Ingressos comprados fora do site (no evento ou com o produtor) e cortesias só entram na sua conta depois que você confirma o seu e-mail. É rápido: mandamos um código de 6 números.',
  avisoSemEmail:
    'Ingressos comprados fora do site (no evento ou com o produtor) e cortesias só entram na sua conta depois que você confirma um e-mail. Adicione o seu e mandamos um código de 6 números.',
  avisoBotaoConfirmar: 'Confirmar meu e-mail',
  avisoBotaoAdicionar: 'Adicionar e-mail',

  // OS-303: logo depois do "E-mail confirmado!", quando pedidos sem dono entraram na conta.
  pedidosQueEntraram: (n: number) =>
    n === 1
      ? 'Encontramos 1 pedido seu e ele já está em Meus ingressos.'
      : `Encontramos ${n} pedidos seus e eles já estão em Meus ingressos.`,
} as const;
