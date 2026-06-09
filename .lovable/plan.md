## Fase 3 — Botão "Solicitar Saque" por evento (Financeiro do produtor)

Escopo restrito a `src/pages/Financeiro.tsx`, aba **Por Evento**. Nada de admin, RLS, storage, SQL ou edge functions.

### Mudanças

**1. `src/pages/Financeiro.tsx`**
- Importar `Button`, `AlertDialog*` (padrão shadcn já usado no projeto), `toast` do `sonner`, `useQueryClient` do `@tanstack/react-query`, e o ícone `Banknote` (lucide).
- Adicionar estado local:
  - `selectedEvent: { id: string; title: string; available: number } | null` — controla qual evento está no diálogo.
  - `isSubmitting: boolean` — para desabilitar o "Confirmar" e mostrar "Solicitando…".
- Obter `const queryClient = useQueryClient();` e o `user?.id` (via `useAuth` ou reaproveitando o que `useProducerFinance` já usa — confirmar no hook). Para invalidar basta `queryClient.invalidateQueries({ queryKey: ['producer-finance'] })` (prefix match, não precisa do user id).
- Em cada card de evento, adicionar um botão **"Solicitar Saque"**:
  - Desabilitado quando `event.available <= 0`.
  - `onClick` precisa de `e.preventDefault(); e.stopPropagation();` porque o card inteiro é um `<Link>` para `/produtor/financeiro/:id`. Sem isso, clicar no botão navega.
  - Define `selectedEvent` e abre o `AlertDialog`.
  - Posição: no bloco `hidden sm:flex` (desktop) e também aparecer no bloco mobile (abaixo da linha "Receita Líquida"), para manter o layout responsivo atual.
- Renderizar um único `AlertDialog` controlado por `selectedEvent != null`, fora do `.map`, com:
  - Título: `Solicitar Saque`
  - Descrição: `Confirmar saque de {formatBRL(selectedEvent.available)}?`
  - `AlertDialogCancel`: "Cancelar" (desabilitado durante submit).
  - `AlertDialogAction`: "Confirmar" / "Solicitando..." quando `isSubmitting`.

**2. Handler `handleConfirm`**
```ts
setIsSubmitting(true);
const { data, error } = await supabase.functions.invoke('request-payout', {
  body: { event_id: selectedEvent.id },
});
setIsSubmitting(false);

if (error || !data?.ok) {
  const code = data?.error as string | undefined;
  const messages: Record<string,string> = {
    already_requested: 'Você já tem um saque solicitado para este evento.',
    no_available_balance: 'Não há saldo disponível para saque.',
    no_bank_account: 'Cadastre sua conta bancária antes de solicitar o saque.',
    not_event_owner: 'Este evento não pertence à sua conta.',
    event_not_found: 'Evento não encontrado.',
  };
  toast.error(messages[code ?? ''] ?? 'Não foi possível solicitar o saque. Tente novamente.');
  setSelectedEvent(null);
  return;
}

toast.success('Saque solicitado com sucesso');
setSelectedEvent(null);
queryClient.invalidateQueries({ queryKey: ['producer-finance'] });
```

> Obs.: `supabase.functions.invoke` retorna `error` quando o HTTP status ≠ 2xx. A edge `request-payout` devolve 400 quando `ok:false`, então o corpo vem em `error.context` em alguns casos. Para cobrir os dois caminhos, o handler também tenta ler `await error.context?.json()` se `data` estiver vazio. (Detalhe técnico — vou tratar na implementação.)

### Não fazer
- Sem PIN no botão (já validado na entrada da aba).
- Sem campo de valor (saque = `available` inteiro).
- Sem alterações em admin, policies, storage, SQL, edge functions, ou no hook `useProducerFinance`.
- Sem mudanças visuais fora dos cards de evento.

### Arquivos tocados
- `src/pages/Financeiro.tsx` (único arquivo modificado).
