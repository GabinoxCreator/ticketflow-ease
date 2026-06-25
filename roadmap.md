# Roadmap / Dívidas técnicas

## Dívida temporária — override de vocabulário por slug (`5-confra-do-bem`)

**O quê:** a página de detalhe do evento (`src/pages/EventDetails.tsx` + filhos
`PriceAndShareBar`, `EventCartMiniBar`, `EventCartSheet`, `EventPolicies`) troca o
vocabulário **só** para o evento beneficente de slug `5-confra-do-bem`:

- "A partir de" → "Doação"
- "Ingressos" (título da seção) → "Convites"
- "X ingresso(s)" (barra inferior / carrinho) → "X convite(s)"
- accordion "Meia-entrada" escondido

**Guard:** `isBeneficentEvent(event)` em `src/data/donationCampaigns.ts` (único ponto
de verdade da string mágica `BENEFICENT_EVENT_SLUG`). Todo o caminho `else` é idêntico
ao comportamento atual — nenhum outro evento muda.

**Fora de escopo (continuam dizendo "ingresso"):** checkout, e-mails, PDF de ingresso,
nav global ("Meus Ingressos") e as entidades de ticket. O `sector_name` do lote é dado
do produtor (renomeado direto no `event_lots`, não no código).

**Generalizar quando:** existir o modo "evento beneficente" (flag/coluna no evento).
Aí remover o slug hardcoded e derivar o vocabulário dessa configuração.
