# Plano revisado — Ajustes 1, 2, 3

Confirmação: `customerPhone` é **opcional** nas duas edge functions de pagamento de mesa (`create-seat-pix/index.ts:29` e `charge-seat-card/index.ts:30` — `customerPhone?: string`; L141/L143: `customerPhone || null`; L213: spread condicional `...(phoneObj ? { phone: phoneObj } : {})`). → opção (b) aprovada, telefone não é pedido.

---

## Ajuste 2 — Mesa: 1 clique, 1 mesa (corrigido)

### `src/hooks/useSeatHold.ts`
- `holdSelected(seatIds, initialAddons?)` aceita um 2º parâmetro opcional. O hold criado já nasce com os addons gravados em `sessionStorage` — sem race entre `setSeatAddon` async e `navigate`.

### `src/components/seated/SeatDetailModal.tsx` (reescrito)
- Props: `{ seat, open, onClose, onConfirm(seatId, addons), isProcessing }`. Sem `onConfirm/onConfirmAndContinue/onRemove/initialAddons/alreadySelected`.
- Único CTA: `Reservar Mesa {label}` (variant hero). Botão secundário `Cancelar` (ghost) que fecha.
- Branch responsivo: `useIsMobile()` → `<Drawer>` (bottom-sheet shadcn), senão `<Dialog>`. Conteúdo idêntico nos dois.
- Stepper de adicionais só aparece se `max > base`.

### `src/lib/seatCheckoutNav.ts` (novo)
```ts
export function goToSeatCheckout(navigate, markProceeding, eventId) {
  markProceeding();
  navigate(`/checkout/mesa/${eventId}`);
}
```
Único call-site de `markProceeding()` em `src/`.

### `src/pages/EventDetailsSeated.tsx` (reescrito)
- Remove: `localSelection`, `pendingAddons`, `handleConfirmSeat`, `handleClearSelection`, `handleConfirmAndContinue`, `handleRemoveSeat`, `doHold` antigo.
- `handleToggleSeat(seatId)` bloqueia se já tem `hold` (mesa atual já reservada) e se status visual ≠ available; senão abre modal.
- `handleConfirmReserve(seatId, addons)`:
  ```ts
  setIsHolding(true);
  const initial = addons > 0 ? { [seatId]: addons } : undefined;
  const result = await holdSelected([seatId], initial);
  setIsHolding(false);
  if (!result) { setModalSeatId(null); return; }      // hook já fez toast + refetch
  goToSeatCheckout(navigate, markProceeding, eventId);
  ```
- `resolveVisualStatus`: remove o ramo `localSelection.has(seat.id)`; só available/held-other/selected-mine (do próprio hold)/sold/blocked.
- `SelectionPanel` continua sendo renderizado no `<aside>` mas agora é **read-only do hold ativo** (vide abaixo).

### `src/components/seated/SelectionPanel.tsx` (simplificado)
- Props enxutas: `{ seats, hold, addons, isHolding, eventId, onRelease, setSeatAddon, markProceeding }`. Remove `localSelection`, `pendingAddons`, `onClearSelection`, `onContinue`, `onEditSeat`.
- Sem `hold` → mostra placeholder "Clique numa mesa disponível no mapa para reservar." (branch `localSelection.size > 0 && !hold` morto: removido).
- Com `hold` → lista as mesas com stepper de adicionais (já existia), total, botão `Ir para pagamento` que chama `goToSeatCheckout(navigate, markProceeding, eventId)`, e link "Cancelar reserva" (`onRelease`).
- Conta de `markProceeding(` em `src/` após: **1** (dentro de `seatCheckoutNav.ts`).

### Verificação
`rg -n "markProceeding\(" src/` → 1 resultado. `rg -n "localSelection" src/` → 0 resultados.

---

## Ajuste 1 — Layout side-by-side em `/evento/:slug`

### `src/components/event/EventOrderSummary.tsx` (novo)
Recebe `{ items, totalAmount, onCheckout, isFinished, hasMesa, mesaCtaHref }` e renderiza um card "Resumo" com lista + total + botões. Usado pelo sidebar desktop e pelo bottom-bar mobile (via `cn("...", variant === 'bar' && '...')`).

### `src/pages/EventDetails.tsx` (reescrito)
Estrutura nova abaixo do `<Header />`:

```tsx
<main className={cn('pt-20 w-full pb-28 lg:pb-0')}>
  {finishedBanner}
  <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 lg:py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8">
    {/* Coluna principal */}
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Hero: info + banner */}
      <section className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 lg:gap-6 items-start">
        <div className="space-y-3 order-2 md:order-1">
          <h1>{title}</h1>
          <{city, state}> + <{venue}> + <{address}> + <{date/time}>
          <PriceAndShareBar />
        </div>
        <div className="order-1 md:order-2">
          <div className="aspect-[16/9] rounded-2xl overflow-hidden ...">
            <img ... />
            <LikeButton />
          </div>
        </div>
      </section>

      {hasMap && <MesaReservaCTA />}
      {activeLots.length > 0 && <LotsSection />}
      <AboutSection />
      <ProducerSection />
      <EventPolicies />
    </div>

    {/* Sidebar desktop sticky */}
    <aside className="hidden lg:block">
      <div className="sticky top-24">
        <EventOrderSummary variant="sidebar" ... />
      </div>
    </aside>
  </div>
</main>

{/* Bottom-bar mobile (só quando tem itens OU mesa disponível) */}
<div className="lg:hidden fixed bottom-0 ...">
  <EventOrderSummary variant="bar" ... />
</div>
```

Detalhes:
- Banner aspect `16/9` desktop **e mobile** (acaba o 4/5 vertical cortado).
- Mobile (`<lg`): empilhado, banner primeiro (`order-1` em mobile via `order-1 md:order-2`).
- Sidebar só renderiza no desktop (`hidden lg:block`).
- Bottom-bar substitui o atual (L487–518). Mostra: quando `totalTickets > 0` → "X ingressos · R$ Y" + "Comprar"; quando `hasMap && totalTickets === 0` → "Reserve sua mesa" + link "Ver Mapa" (que vai para `/evento/:slug/mapa`). Quando nem um nem outro, esconde.
- Sidebar desktop renderiza sempre que `hasMap || activeLots.length > 0`. Sem itens selecionados mostra placeholder "Selecione seus ingressos" + (se mesa) CTA "Ver Mapa de Mesas".
- `max-w-3xl` interno some — coluna principal já é limitada pelo grid.

---

## Ajuste 3 — `SeatCheckout` pula form quando logado

### `src/pages/SeatCheckout.tsx`
- Trocar `const { user } = useAuth()` por `const { user, profile } = useAuth()`.
- Prefill (substituir L131–141):
  ```ts
  useEffect(() => {
    if (!user || customer) return;
    const meta = (user.user_metadata || {}) as Record<string, any>;
    setCustomer({
      name: profile?.nome_completo || meta.name || meta.full_name || user.email?.split('@')[0] || '',
      email: profile?.email || user.email || '',
      cpf: profile?.cpf || meta.cpf || '',
      phone: profile?.whatsapp || meta.phone || meta.whatsapp || '',
    });
  }, [user, profile, customer]);
  ```
- `Step` ganha `'cpf'`. Estado inicial muda para `null` e um effect decide depois que `customer` está pronto:
  ```ts
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    if (!customer || step !== null) return;
    if (!user) { setStep('form'); return; }
    const digits = customer.cpf.replace(/\D/g, '');
    const cpfOk = digits.length === 11 && validateCPF(digits);
    const nameOk = customer.name.trim().length >= 3;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email);
    if (cpfOk && nameOk && emailOk) setStep('method');
    else setStep('cpf');
  }, [customer, user, step]);
  ```
- Render do step `'form'` (L306) fica restrito a `!user`. Adicionar render do step `'cpf'`:
  ```tsx
  {step === 'cpf' && user && (
    <CheckoutStepCPF
      initialCPF={customer.cpf}
      initialName={customer.name}
      initialEmail={customer.email}
      requireName={customer.name.trim().length < 3}
      requireEmail={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)}
      onContinue={(cpf, name, email) => {
        setCustomer({ ...customer, cpf, name: name || customer.name, email: email || customer.email });
        setStep('method');
      }}
    />
  )}
  ```
- Loading guard (L273) checa `step === null` também.

Telefone não é pedido (edge functions aceitam vazio).

---

## Arquivos

- **novo** `src/lib/seatCheckoutNav.ts`
- **novo** `src/components/event/EventOrderSummary.tsx`
- editar `src/hooks/useSeatHold.ts` (`holdSelected` aceita addons iniciais)
- reescrever `src/components/seated/SeatDetailModal.tsx` (Drawer/Dialog, 1 CTA)
- reescrever `src/pages/EventDetailsSeated.tsx` (sem localSelection)
- simplificar `src/components/seated/SelectionPanel.tsx` (read-only)
- reescrever `src/pages/EventDetails.tsx` (grid side-by-side + bottom-bar)
- editar `src/pages/SeatCheckout.tsx` (prefill + step dinâmico + CheckoutStepCPF)

Sem migrações. Sem edge functions.

## Verificação pós-implementação

1. `rg -n "markProceeding\(" src/` → 1 ocorrência.
2. `rg -n "localSelection" src/` → 0 ocorrências.
3. `bunx tsc --noEmit` limpo.
4. Screenshots: `/evento/:slug` 1280×800 + 380×740; modal de mesa aberto (mobile drawer + desktop dialog); `/checkout/mesa/:id` logado (mostra step `method` direto OU `cpf` só pedindo o que falta).
