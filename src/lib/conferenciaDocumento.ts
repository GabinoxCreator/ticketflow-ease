// OS-338: se a base oficial ENCONTROU o CPF/CNPJ da produtora no
// cadastro, ou se ele está pendente de conferência pela casa. Quem decide é o
// banco (coluna `producer_profiles.documento_conferencia`, gravada por gatilho);
// aqui é só a leitura para o painel da casa.
//   base_oficial · a base oficial encontrou o documento no cadastro (pela tela).
//                  Encontrar NÃO prova que o documento é de quem se cadastrou: a
//                  consulta é pública (revisão 1). Por isso nunca "conferido".
//   pendente     · entrou sem a base encontrar (cadastro direto pela chave pública,
//                  base fora do ar), é de outra conta, ou foi trocado depois
//   casa         · a casa conferiu à mão
//   null         · produtora criada antes desta marca existir no banco (não se afirma nada)

export type ConferenciaDocumento = 'base_oficial' | 'pendente' | 'casa' | null;

/** A coluna é nova e ainda não está no types.ts gerado: leitura sem tipo. */
export function lerConferencia(produtora: unknown): ConferenciaDocumento {
  const v = (produtora as { documento_conferencia?: unknown } | null)?.documento_conferencia;
  return v === 'base_oficial' || v === 'pendente' || v === 'casa' ? v : null;
}

export const TEXTO_CONFERENCIA: Record<'base_oficial' | 'pendente' | 'casa' | 'antes', string> = {
  base_oficial: 'Documento encontrado na base oficial',
  casa: 'Conferido pela casa',
  pendente: 'Pendente de conferência pela casa',
  antes: 'Cadastrado antes da marca da base oficial',
};
