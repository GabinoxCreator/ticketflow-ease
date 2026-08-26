import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VocabularioAssento } from '@/lib/vocabularioAssento';

/*
 * O interruptor do mapa no site.
 *
 * Existe porque publicar o evento e abrir a venda de camarote eram a MESMA
 * coisa: quem quisesse vender ingresso tinha que aceitar o mapa no ar junto.
 * O Rodeo precisa do meio-termo — ingresso vendendo enquanto o camarote ainda
 * espera preço e mapa conferido (26/08).
 *
 * ⚠️ Desligar aqui NÃO é só esconder na tela: o servidor recusa a reserva
 * (`hold_seats`). Quem guardou o link do mapa não entra por uma porta lateral.
 */

interface Props {
  eventId: string;
  v: VocabularioAssento;
}

export function VisibilidadeDoMapa({ eventId, v }: Props) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mapa-visibilidade', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('status, seat_map_public')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      // cast: types.ts é auto-gerado e ainda não tem `seat_map_public`.
      return data as unknown as { status: string; seat_map_public: boolean | null } | null;
    },
  });

  const alternar = useMutation({
    mutationFn: async (proximo: boolean) => {
      const { error } = await supabase
        .from('events')
        .update({ seat_map_public: proximo } as any)
        .eq('id', eventId);
      if (error) throw error;
      return proximo;
    },
    onSuccess: (proximo) => {
      qc.invalidateQueries({ queryKey: ['mapa-visibilidade', eventId] });
      qc.invalidateQueries({ queryKey: ['event'] });
      toast.success(
        proximo ? `${v.Plural} à venda no site` : `${v.Plural} fora do site`,
      );
    },
    onError: () => toast.error('Não deu para mudar agora. Tente de novo.'),
  });

  if (isLoading) return <Skeleton className="h-24" />;
  if (!data) return null;

  const ligado = data.seat_map_public !== false;
  const publicado = data.status === 'published';
  // Ligado mas o evento em rascunho: o mapa não está no ar de fato. Dizer
  // "visível" aqui seria mentir para quem vai conferir no site.
  const noArDeVerdade = ligado && publicado;

  return (
    <Card className={`p-4 sm:p-5 ${ligado ? 'border-primary/30' : 'border-amber-500/30 bg-amber-500/[0.03]'}`}>
      <div className="flex items-start gap-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            noArDeVerdade ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-500'
          }`}
        >
          {ligado ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            {noArDeVerdade
              ? `${v.Plural} à venda no site`
              : ligado
                ? `${v.Plural} aparecem quando o evento for publicado`
                : `${v.Plural} fora do site`}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {noArDeVerdade ? (
              <>Qualquer pessoa vê o mapa na página do evento e consegue comprar.</>
            ) : ligado ? (
              <>O evento está em rascunho, então ninguém vê o mapa ainda. Ao publicar, ele
                aparece junto — desligue aqui se quiser publicar sem abrir a venda.</>
            ) : (
              <>Você continua vendendo aqui pelo painel normalmente. O comprador não vê o mapa
                na página do evento e <strong>não consegue reservar</strong>, nem com o link direto.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {alternar.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={ligado}
            disabled={alternar.isPending}
            onCheckedChange={(c) => alternar.mutate(c)}
            aria-label={ligado ? `Tirar ${v.plural} do site` : `Colocar ${v.plural} no site`}
          />
        </div>
      </div>
    </Card>
  );
}

export default VisibilidadeDoMapa;
