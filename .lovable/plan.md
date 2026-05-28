## A) Fit inicial do mapa centralizado

**Arquivos:** `src/components/seated/SeatMapRenderer.tsx`, `src/pages/EventDetailsSeated.tsx`, `src/pages/EventMapPage.tsx`.

**Diagnóstico atual** (`SeatMapRenderer.tsx:60-76`):
- Usa `viewBox="0 0 1200 800"` (dimensões do `table_map`), o container é `overflow-auto`, e o zoom é aplicado via CSS `transform: scale()` no wrapper com `width: 100*zoom%`.
- Resultado: o SVG enche a largura disponível, mas o conteúdo do mapa raramente ocupa todo o `table_map` (telão fica em y pequeno, mesas concentradas → "espaço preto" lateral e topo cortado quando container é mais estreito que o aspect 1200x800).
- Não há cálculo de bbox real do conteúdo, nem fit ao container, nem ResizeObserver.

**Mudanças:**

1. **SeatMapRenderer**: aceitar novas props `availableWidth` e `availableHeight` (medidos pelo pai) e remover dependência de scroll/transform para o estado inicial.
   - Calcular bbox do conteúdo (`calculateBounds` já existe em `src/lib/calculateFitView.ts`) sobre `seats` + `map_objects` (considerando `width`/`height` de cada objeto e `radius` p/ assentos).
   - Aplicar padding de 24 a esse bbox e usar `viewBox={\`${bbox.minX-24} ${bbox.minY-24} ${bboxW+48} ${bboxH+48}\`}`.
   - Trocar wrapper para `w-full h-full flex items-center justify-center` (sem `overflow-auto` no estado fit) e SVG com `preserveAspectRatio="xMidYMid meet"`, `className="w-full h-full"`.
   - O `zoom` deixa de mexer no CSS scale do wrapper; vira um multiplicador aplicado ao `viewBox` (encolhe a janela em torno do centro do bbox → aumenta visualmente). Quando `zoom > fit` o container ganha `overflow: auto` e o `<svg>` recebe `width/height` em pixels (bbox * (zoom/fitZoom)) pra permitir pan via scroll.
   - Sem `maxHeight 70vh` quando `fillHeight`; usa altura real do pai.

2. **EventDetailsSeated**: envolver o `<SeatMapRenderer>` num `<div ref={mapContainerRef} className="flex-1 min-h-0 relative">` e medir `clientWidth`/`clientHeight` com `ResizeObserver`. Passar pra renderer. Gate: só renderiza o mapa quando `width > 0 && height > 0` (evita primeiro paint zerado).
   - A faixa de legenda continua FORA desse container medido → altura disponível já desconta legenda. O painel lateral também está fora (grid sibling).

3. **EventMapPage**: nada muda no header. Manter `zoom` controlado por +/-/% (100% deixa de ser estado inicial — o estado inicial é o "fit" calculado internamente; o botão "100%" passa a resetar pra `zoom = 1` que agora significa "1x do fit"). O `zoom={zoom}` continua sendo passado.

4. **Recalcular no resize:** ResizeObserver no container do mapa + listener de `window.resize` (redundante mas barato).

## B) Resumo do pedido no step 'method'

**Arquivo novo:** `src/components/checkout/SeatOrderSummary.tsx`.

**Props:**
```ts
{
  event: { title: string; venue: string; city: string; state: string };
  seats: SeatSummary[];      // já carregados em SeatCheckout
  addons: Record<string, number>; // do useSeatHold
  totalAmount: number;       // mesma fonte usada nos invokes
}
```

**Conteúdo do card:**
- Linha por assento: `Mesa <label> · <baseCap + addonQty> pessoas` + preço (`base_price + extra_price * addonQty`).
- Sub-linha (quando `addons[id] > 0`): `+ N adicional(is) × R$ extra_price`.
- Subtotal (= total, sem taxa separada hoje no checkout de mesa — não inventar taxa; mostrar só "Total").
- Rodapé pequeno: `{event.title} · {event.venue} — {event.city}/{event.state}`.

**Mudança em `src/pages/SeatCheckout.tsx`:**
- Remover o bloco `<h1>{event.title}</h1>` + `<p>{event.venue}...</p>` (linhas 334-335) APENAS quando `step === 'method'` (nos outros steps mantém como contexto leve no topo, ou também substitui — vou substituir em todos os steps de pagamento, deixando o título grande só nos steps de form/cpf onde resumo ainda não faz sentido).
- Plano final: `step in ['method','pix','card','awaiting']` → renderiza `<SeatOrderSummary>` no topo do card. Demais steps mantém o `<h1>` atual.
- Reusa `seats`, `addons`, `totalAmount` que já existem (linhas 81, 72, 164-172). Zero recálculo paralelo.

## Verificação
- `tsc --noEmit`.
- Screenshots: `/evento/:slug` em 1280 e 380 (mapa centralizado e completo) + step `method` mostrando resumo.

## Fora do escopo
- Lógica de hold, edges (`create-seat-pix`, `charge-seat-card`), webhook, validações de form.
