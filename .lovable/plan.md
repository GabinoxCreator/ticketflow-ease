## Fix: travamento ao copiar PIX no checkout

### Sintomas
Ao clicar em "Copiar código PIX" no modal de pagamento, a tela congela por vários segundos antes de copiar e voltar a responder.

### Causa
O `CheckoutStepPix.tsx` tem três problemas combinados que travam a UI/main thread:

1. **Polling sem trava de concorrência** (`setInterval` a cada 5s chamando `check-mercadopago-payment`). Se a Edge Function/Mercado Pago demora (rede, cold start), as chamadas se empilham. Cada resposta dispara re-render do componente inteiro — incluindo o `QRCodeSVG` (que recalcula o SVG do PIX a cada render) — bloqueando o thread no exato momento em que o usuário clica em copiar.
2. **`navigator.clipboard.writeText` sem fallback**. Em alguns navegadores (WebView do Instagram/Facebook, Safari sem foco) a Promise fica pendente até obter foco, dando a sensação de "travado". Não há fallback para `document.execCommand('copy')`.
3. **`QRCodeSVG` não memoizado** — re-renderiza sempre que `copied`/`isChecking` mudam.

### Correção (somente frontend, sem mudanças de backend)

**`src/components/checkout/CheckoutStepPix.tsx`**
- Memoizar o QR Code: extrair `<QRCodeSVG>` num componente `React.memo` (ou usar `useMemo` no elemento) para que mudanças de estado não o recalculem.
- Adicionar guarda de concorrência no polling:
  - `useRef<boolean>` `inFlightRef` — se já está rodando, pula a iteração.
  - Cancelar com `AbortController` no unmount.
  - Trocar `setInterval` por loop assíncrono com `setTimeout` recursivo para nunca empilhar.
- Substituir `handleCopy` por uma versão não bloqueante:
  - Mostrar feedback **imediatamente** (`setCopied(true)` + toast) antes de aguardar o clipboard.
  - Tentar `navigator.clipboard.writeText` dentro de `try/catch` curto; em caso de Promise pendurada/erro, cair no fallback com `<textarea>` temporário + `document.execCommand('copy')`.
  - Não usar `await` no handler principal — disparar como fire-and-forget para o React não segurar o clique.

**`src/components/checkout/CheckoutModal.tsx`** (apenas `checkPaymentStatus`)
- Adicionar um timeout suave de ~6s no `supabase.functions.invoke` via `Promise.race`, retornando `false` em caso de timeout para evitar que uma chamada lenta segure o próximo tick do polling.

### O que NÃO muda
- Sem alteração na Edge Function `check-mercadopago-payment`, no fluxo PIX do Mercado Pago, no schema, nas RLS ou nas demais etapas do checkout.
- Visual idêntico — só performance e robustez do botão.
