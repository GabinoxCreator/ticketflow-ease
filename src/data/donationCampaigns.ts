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
  /** chamada do botão de doação na página do evento (fica FORA do modal) */
  bannerTitle: string;
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
    bannerTitle: 'Apoie a nossa Glória',
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
  {
    slug: '3-porcada-do-amor',
    eventId: '4d0cfbee-7207-4dd4-b3be-c7bc9151bd1f',
    title: 'Doação voluntária',
    subtitle: '3ª PORCADA DO AMOR DE MIRASSOL',
    bannerTitle: 'Apoie o Hospital de Amor de Barretos',
    pixCopyPaste:
      '00020126360014br.gov.bcb.pix0114540807520001395204000053039865802BR5920ASSOCIACAO DONALDSON6008MIRASSOL62070503***6304C283',
    pixKey: '54.080.752/0001-39',
    pixKeyLabel: 'Chave PIX (CNPJ)',
    recipientName: 'Associação Donaldson Jesus Botos',
    recipientDocument: '54.080.752/0001-39',
    recipientBank: 'Sicredi',
    footer:
      'Doação voluntária e independente da compra do convite. O valor vai direto para a conta da associação, em prol do Hospital de Amor de Barretos.',
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
 * Eventos beneficentes — os que recebem o override TEMPORÁRIO de vocabulário na
 * página de detalhe (ingresso→convite, "A partir de"→"Doação", meia-entrada
 * escondida) e o parecer jurídico no topo das políticas.
 * Único ponto de verdade das strings mágicas — ver dívida técnica no roadmap.md.
 */
export interface BeneficentEvent {
  /** slug do evento */
  slug: string;
  /** entidade que emite os convites e recebe os valores */
  institutionName: string;
  /** CNPJ da entidade, formatado */
  institutionDocument: string;
  /**
   * Causa final, quando o dinheiro NÃO fica na própria entidade (o caso da
   * Porcada: uma associação arrecada em prol de um hospital). Sem isto, a
   * entidade é a própria causa e o parecer sai exatamente como sempre saiu.
   */
  causeName?: string;
}

export const BENEFICENT_EVENTS: BeneficentEvent[] = [
  {
    slug: '5-confra-do-bem',
    institutionName: 'Instituto St',
    institutionDocument: '61.277.431/0001-94',
  },
  {
    slug: '3-porcada-do-amor',
    institutionName: 'Associação Donaldson Jesus Botos',
    institutionDocument: '54.080.752/0001-39',
    causeName: 'Hospital de Amor de Barretos',
  },
];

/** Override por slug, só na página do evento. Qualquer outro evento → undefined (inalterado). */
export function getBeneficentEvent(
  event?: { slug?: string | null } | null,
): BeneficentEvent | undefined {
  if (!event?.slug) return undefined;
  return BENEFICENT_EVENTS.find((b) => b.slug === event.slug);
}

export function isBeneficentEvent(
  event?: { slug?: string | null } | null,
): boolean {
  return !!getBeneficentEvent(event);
}

/**
 * Parecer jurídico exibido como PRIMEIRO item do accordion "Políticas do Evento"
 * SOMENTE nos eventos beneficentes (guard isBeneficentEvent). Único ponto de
 * verdade do texto. `body` é texto puro com `\n` — renderizar com
 * whitespace-pre-line, NÃO reformatar.
 *
 * O texto é o mesmo para todos; só a entidade e o CNPJ da cláusula-modelo mudam,
 * porque é ela que vai ao ar na página de compra (item 5 do parecer). Sem
 * `causeName`, a frase sai palavra por palavra como saía quando só existia a
 * Confra do Bem.
 * Dívida técnica: continua preso ao slug; generalizar no futuro modo "evento beneficente".
 */
export function getBeneficentPolicy(
  info: BeneficentEvent,
): { title: string; body: string } {
  const entidade = info.causeName
    ? `realizado pela ${info.institutionName}, inscrita no CNPJ sob o nº ${info.institutionDocument}, em prol do ${info.causeName}`
    : `realizado em prol da ${info.institutionName}, inscrita no CNPJ sob o nº ${info.institutionDocument}`;
  const destino = info.causeName
    ? 'Toda a receita líquida obtida será integralmente revertida para a instituição beneficiada.'
    : 'Toda a receita líquida obtida será integralmente revertida para a manutenção das atividades socioassistenciais da referida entidade.';

  return {
  title: 'Eventos Beneficentes',
  body: `PARECER TÉCNICO-JURÍDICO ORIENTATIVO
Análise de não obrigatoriedade de cota de meia-entradas em eventos de natureza estritamente beneficente

ASSUNTO: Dispensa do benefício da meia-entrada (Lei nº 12.933/2013) em comercialização eletrônica de convites para eventos filantrópicos no ecossistema Fest Pag.
DATA: 25 de junho de 2026

1. INTRODUÇÃO E CONTEXTUALIZAÇÃO
O presente parecer visa estruturar o fundamento jurídico que desobriga os organizadores de eventos 100% beneficentes e de cunho filantrópico de disponibilizarem a venda de ingressos sob o regime de meia-entrada (estudantes, idosos, portadores de necessidades especiais e jovens de baixa renda), em conformidade com a legislação federal vigente e as orientações dos Tribunais de Justiça nacionais, servindo como diretriz institucional para as operações da Fest Pag.

2. FUNDAMENTAÇÃO JURÍDICA PRINCIPOLÓGICA

2.1. Da Natureza Jurídica do Ingresso e a Ausência de Lucratividade
A Lei Federal nº 12.933/2013 e o Decreto Regulamentador nº 8.537/2015 que regem a concessão da meia-entrada têm como fato gerador a exploração comercial de atividades de cultura, lazer e entretenimento por agentes de mercado. A premissa central é mitigar o custo de acesso do consumidor vulnerável diante de atividades exploradas com finalidade econômica e comercial.
No cenário em que o evento é integralmente beneficente, a cobrança efetuada junto ao público não se reveste de caráter de "tarifa ou preço de ingresso", mas sim de uma doação/contribuição institucional ou de um rateio operacional de custos voltado exclusivamente à captação de recursos para entidades do terceiro setor. Inexiste, portanto, a relação consumerista padrão de fornecedor visando lucro versus consumidor final.

2.2. Do Enquadramento no Código Civil Brasileiro
As entidades sem fins lucrativos (como Associações e Organizações da Sociedade Civil - OSCIPs), conforme os artigos 44 e 53 do Código Civil, são autorizadas a realizar captações para a manutenção de suas atividades fins. Forçar a aplicação da meia-entrada sobre tais receitas acarretaria prejuízo direto à causa assistida, configurando um desvirtuamento do fim social e enriquecimento sem causa por parte do adquirente em detrimento da assistência social promovida.

3. REQUISITOS MANDATÓRIOS PARA A AFASTABILIDADE DO BENEFÍCIO
Para assegurar total blindagem jurídica perante os órgãos de fiscalização e defesa do consumidor (PROCON) e junto aos canais integrados à Fest Pag, a organização deve cumprir rigorosamente os seguintes critérios:
- Reversão Integral do Resultado: O lucro líquido ou o montante bruto arrecadado deve ser integralmente destinado à instituição de caridade, sendo vedada qualquer divisão de lucros a entes privados organizadores.
- Lastro Documental: Existência de ata de assembleia, estatuto da entidade ou termo de parceria/convênio específico assinado entre os organizadores e a instituição beneficiada detalhando a destinação dos recursos.
- Dever de Informação Clara (Art. 6º, III do CDC): Informação clara, ostensiva e prévia ao usuário sobre a destinação e a natureza jurídica da cobrança antes do ato de compra.
Nota de Jurisprudência: O entendimento pacificado nos Tribunais de Justiça estaduais aponta que a exigibilidade de meia-entrada em eventos com propósitos exclusivamente beneficentes viola o princípio da razoabilidade e sufoca a capacidade de atuação das entidades filantrópicas que dependem de doações sociais.

4. DIRETRIZES PRÁTICAS PARA PLATAFORMAS DE VENDA ONLINE
Ao configurar as vendas na plataforma Fest Pag, recomenda-se adotar os seguintes procedimentos de segurança operacional:
1. Nomenclatura Adequada: Substituir expressões como "Ingresso Inteira" por termos institucionais como "Convite Solidário", "Contribuição Filantrópica" ou "Doação + Acesso".
2. Termos e Condições Específicos: Inserir a cláusula de isenção no regulamento do evento e na página de checkout da ferramenta online.

5. MODELO DE CLÁUSULA DE ISENÇÃO PARA INSERÇÃO DIGITAL
Abaixo, o modelo textual formal a ser disponibilizado de maneira pública e visível na página de compras da Fest Pag:
"TERMO DE CONTRIBUIÇÃO SOLIDÁRIA. Este evento possui natureza 100% beneficente e filantrópica, ${entidade}. ${destino} Diante de sua destinação social exclusiva e ausência de finalidade comercial ou lucrativa, os valores cobrados configuram atos de doação/contribuição institucional, não sendo aplicáveis as disposições da Lei Federal nº 12.933/2013 (Lei da Meia-Entrada), conforme entendimento jurisprudencial consolidado."

6. CONCLUSÃO
Conclui-se que a venda de convites solidários sem a oferta de meia-entrada encontra pleno respaldo jurídico e legal no ecossistema da Fest Pag, desde que cumpridos os preceitos de transparência, publicidade e destinação integral dos fundos à causa beneficente, mitigando-se riscos de sanções administrativas ou cíveis.`,
  };
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
