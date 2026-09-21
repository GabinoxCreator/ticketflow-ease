/*
 * O aviso de aceite que fica embaixo do botão — no cadastro e na compra.
 *
 * Decisão do Gabriel (21/09/2026): aviso de texto, SEM caixa para marcar. O clique
 * no botão é o aceite. Zero atrito: o público da ticketeira trava em passo extra, e
 * uma caixa a mais no meio da compra custa venda.
 *
 * Os links abrem em aba nova de propósito — no meio de um cadastro ou de um
 * checkout, navegar para fora faz a pessoa perder o que já digitou.
 */
import { Fragment } from 'react';
import { CAMINHOS_LEGAIS, ROTULOS_COM_ARTIGO, type DocumentoLegal } from '@/lib/documentos-legais';

interface Props {
  /** "Ao criar a conta" · "Ao concluir a compra" — o ato que vale como aceite. */
  acao: string;
  documentos: DocumentoLegal[];
  className?: string;
}

export function AvisoDeAceite({ acao, documentos, className = '' }: Props) {
  return (
    <p className={`text-center text-xs leading-relaxed text-muted-foreground ${className}`}>
      {acao}, você concorda com{' '}
      {documentos.map((doc, i) => (
        <Fragment key={doc}>
          {i > 0 && (i === documentos.length - 1 ? ' e ' : ', ')}
          <a
            href={CAMINHOS_LEGAIS[doc]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            {ROTULOS_COM_ARTIGO[doc]}
          </a>
        </Fragment>
      ))}
      .
    </p>
  );
}
