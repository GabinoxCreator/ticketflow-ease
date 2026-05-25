# Fase 2 — Enriquecer `process-card-payment` com antifraude MP (versão final)

URL do webhook: `${SUPABASE_URL}/functions/v1/mercadopago-webhook` (confirmada no painel).

## Alterações em `supabase/functions/process-card-payment/index.ts`

### 1. CORS
Adicionar `x-meli-session-id` em `Access-Control-Allow-Headers`.

### 2. Capturar IP do cliente
```ts
const clientIp =
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('cf-connecting-ip') ||
  req.headers.get('x-real-ip') ||
  null;
```

### 3. Aceitar `deviceId` no body
`CardPaymentRequest` recebe `deviceId?: string`.

### 4. Split de nome e telefone (com tratamento de DDI 55)
```ts
const nameParts = customerName.trim().split(/\s+/);
const firstName = nameParts[0] || 'Cliente';
const lastName = nameParts.slice(1).join(' ') || firstName;

const phoneDigits = (customerPhone || '').replace(/\D/g, '');
const localDigits = phoneDigits.length >= 12 && phoneDigits.startsWith('55')
  ? phoneDigits.slice(2)
  : phoneDigits;
const areaCode = localDigits.length >= 10 ? localDigits.slice(0, 2) : '';
const phoneNumber = localDigits.length >= 10 ? localDigits.slice(2) : '';
```

### 5. `mpBody` enriquecido
```ts
const mpBody: any = {
  transaction_amount: Number(finalAmount.toFixed(2)),
  token: cardToken,
  description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
  installments,
  payment_method_id: paymentMethodId,
  statement_descriptor: 'FESTPAG',
  notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
  external_reference: order.id,
  payer: {
    email: customerEmail,
    first_name: firstName,
    last_name: lastName,
    identification: { type: 'CPF', number: cleanCPF },
    ...(areaCode && phoneNumber ? { phone: { area_code: areaCode, number: phoneNumber } } : {}),
  },
  additional_info: {
    ip_address: clientIp,
    items: lineItems.map(i => ({
      id: i.lotId,
      title: i.lotName,
      description: `${event.title} - ${i.lotName}`,
      category_id: 'tickets',
      quantity: i.quantity,
      unit_price: Number(i.price.toFixed(2)),
    })),
    payer: {
      first_name: firstName,
      last_name: lastName,
      registration_date: new Date().toISOString(),
      ...(areaCode && phoneNumber ? { phone: { area_code: areaCode, number: phoneNumber } } : {}),
    },
  },
};
if (issuerId) mpBody.issuer_id = parseInt(issuerId);
```

### 6. Headers MP com Device ID
```ts
const mpHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${mercadopagoToken}`,
  'X-Idempotency-Key': `card-${order.id}`,
};
if (deviceId) mpHeaders['X-meli-session-id'] = deviceId;
```

### 7. Persistir `mp_status_detail`
Em todos os `update` de `orders` após resposta MP (approved, in_process/pending, rejected) incluir `mp_status_detail: mpPayment.status_detail || null`.

### 8. Log de debug
```ts
logStep('MP request enriched', {
  hasDeviceId: !!deviceId,
  hasIp: !!clientIp,
  hasPhone: !!(areaCode && phoneNumber),
  hasNotificationUrl: true,
});
```

## Não alterar
Reserva de lotes, cupom, taxa, criação de tickets, `applyOrderApproved`, fluxo de rejeição/release. Apenas payload, headers e persistência de `mp_status_detail`.

## Após implementar
Pausa antes da Fase 3. Mostro o arquivo alterado para revisão.
