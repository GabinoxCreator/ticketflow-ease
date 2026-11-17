/**
 * O acesso do colaborador da portaria, pronto para mandar (OS-408, etapa 5, item 5.3).
 *
 * Formato espaçado, decisão do Gabriel de 16/11/2026 ("Formato espaçado novo"; substitui o
 * texto de uma linha só aprovado em 09/11), o mesmo para "Copiar acesso" e "Enviar pelo
 * WhatsApp":
 *
 *   Olá! Seu acesso à portaria do evento *<evento>*:
 *
 *   • Endereço: https://festpag.digital/colaborador
 *   • Usuário: <usuário>
 *   • Senha: <senha>
 *
 *   Não repasse este acesso.
 *
 * Dois eventos: "dos eventos *A* e *B*:"; três ou mais: "*A*, *B* e *C*"; sem evento marcado:
 * "Olá! Seu acesso à portaria:". O *…* é o negrito do WhatsApp. A senha só existe na tela
 * logo depois de criar o colaborador (o banco guarda só o resumo dela) e nada aqui a grava.
 * Mas, como o Gabriel decidiu em 09/11 ("Vai com a senha"), ela vai DENTRO do texto: na área
 * de transferência ("Copiar acesso") e no link `wa.me` ("Enviar pelo WhatsApp"), e esse link
 * fica no histórico do navegador de quem clicou.
 */
export const ENDERECO_DO_COLABORADOR = 'https://festpag.digital/colaborador';

/** Nome do evento em negrito do WhatsApp (um "*" no próprio nome quebraria o negrito). */
const negrito = (nome: string) => `*${nome.split('*').join('').trim()}*`;

/** "*A*", "*A* e *B*", "*A*, *B* e *C*". */
function listaDeNomes(nomes: string[]): string {
  const n = nomes.map(negrito);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

export function textoDoAcesso({ eventos, usuario, senha }: { eventos: string[]; usuario: string; senha: string }): string {
  const deQue =
    eventos.length === 0 ? ''
    : eventos.length === 1 ? ` do evento ${listaDeNomes(eventos)}`
    : ` dos eventos ${listaDeNomes(eventos)}`;
  return [
    `Olá! Seu acesso à portaria${deQue}:`,
    '',
    `• Endereço: ${ENDERECO_DO_COLABORADOR}`,
    `• Usuário: ${usuario}`,
    `• Senha: ${senha}`,
    '',
    'Não repasse este acesso.',
  ].join('\n');
}

/**
 * Link do WhatsApp com o texto pronto; o produtor escolhe o contato no próprio WhatsApp.
 * As quebras de linha vão como %0A (encodeURIComponent), que o WhatsApp mostra como linha nova.
 */
export function linkDoWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
