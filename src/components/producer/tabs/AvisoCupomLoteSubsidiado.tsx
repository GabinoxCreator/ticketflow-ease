import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';

/*
 * O aviso que impede o produtor de descontar duas vezes do próprio bolso.
 *
 * Num lote com `modo_taxa = 'absorve'` o produtor já abre mão da taxa de serviço
 * para o comprador ver o valor redondo — o repasse do promocional do Rodeo já
 * sai a R$ 270 num ingresso anunciado a R$ 300. Um cupom em cima disso desconta
 * de NOVO sobre o que ele já subsidiou: 20% levariam o repasse a R$ 216.
 *
 * O framework do evento decidiu em 14/08 que cupom é proibido nesses lotes. A
 * trava técnica não existe (a tabela de cupons não tem restrição por lote), e a
 * decisão do Gabriel em 26/08 foi resolver por aviso: não criar cupom enquanto
 * esses lotes estiverem à venda, e liberar depois que se encerrarem.
 *
 * ⚠️ Ligado por DADO, nunca por evento: quem não tem lote subsidiado não vê
 * nada. E o aviso SOME sozinho quando o último lote desses se encerra — que é
 * exatamente o momento em que criar cupom volta a ser seguro.
 */

interface Props {
  eventId: string;
}

export function AvisoCupomLoteSubsidiado({ eventId }: Props) {
  const { data: lotes } = useQuery({
    queryKey: ['lotes-subsidiados', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_lots')
        .select('name, price, modo_taxa, is_active, manually_sold_out, total_quantity, sold_quantity')
        .eq('event_id', eventId)
        .eq('modo_taxa', 'absorve')
        .eq('is_active', true);
      if (error) throw error;
      // "Encerrado" é o que tira o lote da vitrine: desligado, marcado como
      // esgotado, ou sem saldo. Só os que ainda vendem justificam o aviso.
      return (data ?? []).filter((l: any) => {
        if (l.manually_sold_out) return false;
        const total = Number(l.total_quantity ?? 0);
        const vendidos = Number(l.sold_quantity ?? 0);
        return total === 0 || vendidos < total;
      });
    },
  });

  if (!lotes || lotes.length === 0) return null;

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-4 sm:p-5">
      <div className="flex gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
        </div>
        <div className="min-w-0 space-y-2.5">
          <p className="font-semibold text-sm">
            Não crie cupom enquanto {lotes.length === 1 ? 'este lote estiver' : 'estes lotes estiverem'} à venda
          </p>

          <div className="flex flex-wrap gap-2">
            {lotes.map((l: any) => (
              <span
                key={l.name}
                className="inline-flex items-baseline gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs"
              >
                <strong className="font-semibold">{l.name}</strong>
                <span className="text-muted-foreground">{fmt(Number(l.price))}</span>
              </span>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {lotes.length === 1 ? 'Neste lote' : 'Nestes lotes'} <strong>você já absorve a taxa de serviço</strong> para
            o comprador ver o valor redondo — o repasse já sai menor que o preço anunciado. Um cupom aqui desconta
            de novo, <strong>em cima do que você já subsidiou</strong>.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Assim que {lotes.length === 1 ? 'ele se encerrar' : 'eles se encerrarem'}, este aviso some sozinho e
            criar cupom volta a ser seguro.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AvisoCupomLoteSubsidiado;
