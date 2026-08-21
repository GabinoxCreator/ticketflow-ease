import { UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * "1 ingresso por pessoa em cada noite" — o aviso, nas três telas.
 *
 * A regra é anti-cambista e o servidor a aplica de qualquer jeito. Mas ela
 * surpreende quem compra: é natural achar que dá para levar três ingressos da
 * mesma noite para os amigos, e descobrir isso só na recusa do pagamento é a
 * pior forma de aprender (Gabriel, 20/08).
 *
 * Por isso o mesmo aviso aparece na lista de ingressos, no carrinho e no
 * pagamento — três momentos em que a pessoa pode estar formando a expectativa
 * errada. Um texto só, num arquivo só, para as três telas não divergirem.
 *
 * ⚠️ Quem decide se ele aparece é a tela, olhando os dados (evento com noites
 * cadastradas). Este componente não sabe de rodeio nenhum.
 */

interface Props {
  /** `chip` na lista de ingressos · `linha` no carrinho e no pagamento. */
  variante?: 'chip' | 'linha';
  className?: string;
}

const TEXTO = '1 ingresso por pessoa em cada noite';
const EXPLICACAO = 'Para levar alguém, a compra sai no CPF dessa pessoa.';

export function AvisoUmPorNoite({ variante = 'linha', className }: Props) {
  if (variante === 'chip') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10',
          'px-3 py-1 text-xs font-semibold text-amber-300',
          className,
        )}
      >
        <UserCheck className="w-3.5 h-3.5 shrink-0" />
        {TEXTO}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5',
        className,
      )}
    >
      <UserCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed">
        <strong className="text-amber-300">{TEXTO}.</strong>{' '}
        <span className="text-muted-foreground">{EXPLICACAO}</span>
      </p>
    </div>
  );
}
