/*
 * O aviso de que a taxa de serviço não volta na desistência. Fica na tela de
 * pagamento, logo acima do aviso de aceite.
 *
 * Por que existe (01/10/2026): a regra já estava na Política de Reembolso e na
 * página "Entenda a taxa", mas o comprador só lia se abrisse o link. Cláusula que
 * limita direito do consumidor tem de estar em destaque, de leitura imediata
 * (CDC, art. 54, § 4º), e o lugar disso é onde a pessoa decide pagar.
 *
 * Quem chama só mostra quando HÁ taxa na compra: em lote que o produtor absorve
 * não existe taxa para reter, e o aviso só confundiria.
 *
 * O texto vem de `RESUMO_REEMBOLSO`, a fonte única. Não escrever a regra aqui.
 */
import { Info } from 'lucide-react';
import { CAMINHOS_LEGAIS, NOMES_LEGAIS, RESUMO_REEMBOLSO } from '@/lib/documentos-legais';

export function AvisoTaxaNaoReembolsavel({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3.5 py-2.5 text-left text-xs leading-relaxed text-foreground ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{RESUMO_REEMBOLSO.taxaNoPagamento}</strong> Prazos e regras na{' '}
        <a
          href={CAMINHOS_LEGAIS.reembolso}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:text-primary"
        >
          {NOMES_LEGAIS.reembolso}
        </a>
        .
      </span>
    </p>
  );
}
