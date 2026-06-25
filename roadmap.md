# Roadmap / Dívidas técnicas

## Dívida temporária — override de vocabulário por slug (`5-confra-do-bem`)

**O quê:** a página de detalhe do evento (`src/pages/EventDetails.tsx` + filhos
`PriceAndShareBar`, `EventCartMiniBar`, `EventCartSheet`, `EventPolicies`) troca o
vocabulário **só** para o evento beneficente de slug `5-confra-do-bem`:

- "A partir de" → "Doação"
- "Ingressos" (título da seção) → "Convites"
- "X ingresso(s)" (barra inferior / carrinho) → "X convite(s)"
- accordion "Meia-entrada" escondido
- accordion ganha 1º item "Eventos Beneficentes" com o parecer jurídico completo
  (`BENEFICENT_POLICY` em `src/data/donationCampaigns.ts`, único ponto de verdade;
  texto hardcoded sob o slug — generalizar junto no modo "evento beneficente")
- telemetria de cliques "Doar"/"Copiar PIX" (`src/lib/donationTelemetry.ts` →
  edge `track-donation-click`, verify_jwt=false, insert service-role em
  `donation_click_events`). Atrás do guard `isBeneficent` nos call sites
  (`EventDetails`/`DonationModal`); nenhum outro evento dispara. Tabela com RLS
  ligado e SEM policy (só service-role grava). Consulta por SQL, sem painel.
  Hardcoded sob o slug — generalizar junto no modo "evento beneficente"

**Guard:** `isBeneficentEvent(event)` em `src/data/donationCampaigns.ts` (único ponto
de verdade da string mágica `BENEFICENT_EVENT_SLUG`). Todo o caminho `else` é idêntico
ao comportamento atual — nenhum outro evento muda.

**Fora de escopo (continuam dizendo "ingresso"):** checkout, e-mails, PDF de ingresso,
nav global ("Meus Ingressos") e as entidades de ticket. O `sector_name` do lote é dado
do produtor (renomeado direto no `event_lots`, não no código).

**Generalizar quando:** existir o modo "evento beneficente" (flag/coluna no evento).
Aí remover o slug hardcoded e derivar o vocabulário dessa configuração.

## Integração de pagamento por evento (Marcel/Safe2Pay) — ✅ EM PRODUÇÃO (25/06)

A 5ª Confra do Bem (`e86df07b-e06f-471e-abf0-a5ec94a11b93`) está com `payment_provider = 'marcel'` e VENDENDO via Marcel (PIX + cartão). Os outros 12 eventos publicados seguem no Mercado Pago, intocados. Evento "Teste" (`9124abef-...`) está marcel mas em draft (invisível). Roteamento por coluna `events.payment_provider` (default `'mercadopago'`, check `in ('mercadopago','marcel')`).

Contrato da API do Marcel (secret `MARCEL_PIX_BASE`): `POST /pix` (amount em reais, retorna pixCode/qrCodeImage/transactionId), `POST /checkpix` (pago se aprovado===true OU status===3, SEM webhook), `POST /credit` (cartão síncrono, retorna aprovado/authorizationCode). Endpoints abertos (sem auth).

### Pronto e testado (curl + UI, pagamentos reais) — ✅
- ✅ `confra-create-pix` (verify_jwt=true) — cria cobrança PIX; grava `provider_transaction_id`/`provider_pix_code`.
- ✅ `confra-check-pix` (verify_jwt=true) — polling autoritativo (`/checkpix`); confirma via `applyOrderApproved` (idempotente). Chamado pelo front.
- ✅ `confra-process-card` (verify_jwt=true) — cartão CRU síncrono (`/credit`); aprova/recusa na hora; grava `provider_authorization_code`. Aprovação validada pela UI.
- ✅ `confra-reconcile-pix` (verify_jwt=false) — cron de segurança (pg_cron jobid 7, `confra-reconcile-pix-every-2-min`, `*/2 * * * *`, ativo, runs succeeded). Varre PIX pending de eventos marcel (janela 6h, limite 50), confirma quem pagou. PROVADO: confirmou um pago sozinho com a aba fechada (cenário 23/05 coberto).
- ✅ Front (`CheckoutModal`) roteia PIX e cartão por `payment_provider`. `CheckoutStepCardMarcel` (form cru, sem SDK MP, sem parcelas). PIX usa a `CheckoutStepPix` compartilhada (mesma p/ MP e Marcel).
- ✅ Colunas adicionadas em `orders`: `provider_transaction_id`, `provider_pix_code`, `provider_authorization_code`.
- ✅ Bug do "copiar PIX" travando no celular — RESOLVIDO. Causa provada por teste de isolamento: o `toast.success` no clique travava a thread no celular (animação + repaint pesado). Removido; feedback fica no próprio botão (`setCopied`). Confirmado liso no celular.

### Dívidas técnicas conscientes (aceitas para este evento) — ⚠️
- ⚠️ **PCI — cartão cru:** `confra-process-card` recebe PAN+CVV crus no body (Marcel não tokeniza, ao contrário do MP). Decisão consciente, evento único, temporário. Nunca armazenado/logado. Reverter (PIX-only ou despublicar) após a Confra.
- ⚠️ **Endpoints do Marcel abertos** (sem auth). Confirmado com Marcel. Risco aceito para o evento.
- ⚠️ **`mp_payment_id` guarda id do Marcel** nas orders marcel (a RPC `apply_order_approved` reusa a coluna). Funciona; nomenclatura ambígua.
- ⚠️ **CPF trava em pedido PIX abandonado:** com a trava "1 por CPF", todo PIX iniciado e não pago bloqueia o CPF até o `expire-pending-orders` limpar. Aconteceu no teste (pedido cancelado na mão). Pode gerar dúvida de cliente no dia da Confra. Avaliar cancelamento mais rápido ou mensagem clara.

### Pendências / hardening — 📋
- 📋 **`event_seats` — vazamento em SELECT público:** a policy `event_seats_public_select` retorna a linha inteira, expondo `held_by_user_id`/`order_id`/`pending_order_id`/`sold_order_id`/holder manual. Ignorado no scan do Lovable para liberar o deploy de 25/06. NÃO afeta a Confra (evento por ingresso, sem assentos). Tratar como bloco de hardening: restringir a leitura pública às colunas do assento (via view ou policy por coluna). É um dos achados pré-existentes do scan.
- 📋 **Cartão Marcel — aprovação só validada com cartões pessoais** (ambiente é produção, sem cartões de teste). Recusa e aprovação confirmadas com cartões reais.
- 📋 **Pós-Confra:** reverter o evento para PIX-only ou despublicar, e revisar as dívidas de PCI/endpoints abertos.
