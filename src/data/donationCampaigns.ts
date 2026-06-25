// Campanhas de doação via PIX — APENAS exibição.
// Não cria pedido, não chama edge function, não toca no Supabase e não integra
// Mercado Pago. QR estático/copia-e-cola: o dinheiro vai direto para a conta do
// recebedor. Para liberar uma campanha basta preencher os dados abaixo.

export interface DonationCampaign {
  /** slug do evento onde a campanha aparece */
  slug: string;
  /** id do evento (UUID) — usado como fallback/garantia de match */
  eventId: string;
  /** título exibido no topo do modal */
  title: string;
  /** subtítulo exibido logo abaixo do título */
  subtitle: string;
  /** string PIX copia-e-cola — usada tanto no QR quanto no botão copiar */
  pixCopyPaste: string;
  /** chave PIX legível exibida ao usuário */
  pixKey: string;
  /** rótulo descrevendo o tipo da chave (ex.: "celular") */
  pixKeyLabel: string;
  /** nome do recebedor */
  recipientName: string;
  /** CNPJ ou CPF do recebedor */
  recipientDocument: string;
  /** banco/instituição do recebedor */
  recipientBank: string;
  /** texto do rodapé (exibido em itálico) */
  footer: string;
}

export const DONATION_CAMPAIGNS: DonationCampaign[] = [
  {
    slug: '5-confra-do-bem',
    eventId: 'e86df07b-e06f-471e-abf0-a5ec94a11b93',
    title: 'Doação voluntária',
    subtitle: 'CONFRA DO BEM',
    pixCopyPaste:
      '00020126360014br.gov.bcb.pix0114+55179976581085204000053039865802BR5912INSTITUTO ST6009SAO PAULO62070503***630492D0',
    pixKey: '17997658108',
    pixKeyLabel: 'Chave PIX (celular)',
    recipientName: 'Instituto St',
    recipientDocument: '61.277.431/0001-94',
    recipientBank: 'PagBank',
    footer:
      'Doação voluntária e independente da compra do ingresso. O valor vai direto para a conta do recebedor.',
  },
];

interface DonationCampaignQuery {
  slug?: string | null;
  id?: string | null;
}

/**
 * Retorna a campanha de doação que corresponde ao slug ou id informado.
 * Retorna undefined quando o evento não possui campanha cadastrada.
 */
export function getDonationCampaign({
  slug,
  id,
}: DonationCampaignQuery): DonationCampaign | undefined {
  return DONATION_CAMPAIGNS.find(
    (campaign) =>
      (!!slug && campaign.slug === slug) || (!!id && campaign.eventId === id),
  );
}

/**
 * Slug do evento beneficente que recebe o override TEMPORÁRIO de vocabulário na
 * página de detalhe (ingresso→convite, "A partir de"→"Doação", meia-entrada escondida).
 * Único ponto de verdade da string mágica — ver dívida técnica no roadmap.md.
 */
export const BENEFICENT_EVENT_SLUG = '5-confra-do-bem';

/** Override por slug, só na página do evento. Qualquer outro evento → false (inalterado). */
export function isBeneficentEvent(
  event?: { slug?: string | null } | null,
): boolean {
  return event?.slug === BENEFICENT_EVENT_SLUG;
}

/**
 * Indica se a campanha está pronta para ser exibida (todos os campos
 * obrigatórios preenchidos).
 */
export function isDonationCampaignReady(
  campaign: DonationCampaign | undefined | null,
): campaign is DonationCampaign {
  if (!campaign) return false;
  return Boolean(
    campaign.pixCopyPaste &&
      campaign.pixKey &&
      campaign.recipientName &&
      campaign.recipientDocument &&
      campaign.recipientBank,
  );
}
