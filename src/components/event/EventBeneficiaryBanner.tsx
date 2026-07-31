import { Heart } from 'lucide-react';

/**
 * Bloco informativo da instituição beneficiada — SÓ exibição.
 * Não é clicável, não abre modal, não tem PIX e não toca no Supabase.
 * (O banner de doação com PIX é outro componente: EventDonationBanner.)
 *
 * Conteúdo fixo: hoje existe um único evento com instituição beneficiada
 * (3ª Feijoada do Matteo), guardado por slug no call site em EventDetails.
 * Generalizar junto do "modo evento beneficente" (ver roadmap).
 */
export function EventBeneficiaryBanner() {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
      <div
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundImage:
            'linear-gradient(100deg, #5F6EF9 0%, #B86AD9 52%, #F766C6 100%)',
        }}
      >
        <Heart className="h-5 w-5 text-white" aria-hidden="true" />
      </div>

      <div className="min-w-0 space-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-primary">
          Evento beneficente
        </p>
        <p className="font-semibold text-foreground break-words">
          Associação Livres para Voar
        </p>
        <p className="text-sm text-muted-foreground break-words">
          Toda a renda do evento será destinada à associação, que cuida de pessoas
          com Epidermólise Bolhosa.
        </p>
      </div>
    </div>
  );
}

export default EventBeneficiaryBanner;
