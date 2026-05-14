## Diagnóstico

O erro `new row violates row-level security policy` no upload do banner vem da policy de INSERT do bucket `event-images`:

```
((bucket_id = 'event-images') AND has_role(auth.uid(), 'produtor'))
```

Ou seja, **só usuários com role `produtor` em `user_roles` conseguem fazer upload**. Hoje no banco só 3 usuários têm essa role (os owners das organizações). Quem cai fora:

1. **Admin** (ex: `gabinox54037@gmail.com`, que pelo avatar "G" no print é provavelmente o usuário logado) — admin tem bypass global por RLS, mas a policy só checa `produtor`, então o admin é barrado no Storage.
2. **Membros de organização que não são owner** (`producer_members.role` ≠ owner). Pelo modelo de organizações, qualquer membro `active` deveria poder operar como produtor, mas só o owner ganhou a role `produtor` em `user_roles`.
3. As policies de UPDATE/DELETE/SELECT do bucket nem checam ownership do arquivo — estão abertas demais (qualquer um do bucket pode mexer). É um bug de segurança lateral que vale corrigir no mesmo bloco.

## Causa raiz

A policy de upload está acoplada a uma role legada (`produtor` em `user_roles`) que não cobre nem admins (bypass global) nem membros não-owner de organizações de produtor.

## Plano de correção

Escopo: **apenas** as policies do bucket `event-images` em `storage.objects`. Sem mexer em código de frontend, hooks ou edge functions — o `useImageUpload` já está correto.

### Migration (uma única)

1. **DROP** das 4 policies atuais do `event-images`.
2. **Recriar** com regras corretas:

   - **SELECT (público):** mantém `bucket_id = 'event-images'` (bucket é público).
   - **INSERT:** permite se autenticado **e** (`has_role(auth.uid(),'admin')` **ou** `has_role(auth.uid(),'produtor')` **ou** existe linha em `producer_members` com `user_id = auth.uid()` e `status='active'`).
   - **UPDATE:** mesma regra do INSERT (em `USING` e `WITH CHECK`), mais o admin global.
   - **DELETE:** mesma regra do INSERT.

3. As policies passam a usar funções `SECURITY DEFINER` já existentes (`has_role`) — sem risco de recursão.

### Validação manual

1. Logado como admin (`gabinox…`) em `/produtor/criar-evento` → upload do banner deve funcionar.
2. Logado como produtor owner → upload continua funcionando (regressão).
3. Logado como cliente comum (sem nenhuma role de produtor/admin/membro) → upload deve falhar com 403/RLS (segurança preservada).
4. Após criar o evento, trocar a imagem (UPDATE) e remover (DELETE) — devem funcionar para produtor/admin.
5. Health check: nada na app fora do fluxo de upload de imagem precisa mudar.

### Riscos

- Baixo. A mudança é isolada em policies de Storage.
- Não toca em `events`, `event_lots`, `orders`, `tickets`, `inventário` — sem risco de drift.
- Bucket continua público para SELECT (já era), então URLs antigas continuam acessíveis.

### Fora de escopo

- Não vou normalizar `user_roles` para incluir todos os membros não-owner — isso é uma decisão de modelagem maior. A policy passa a aceitar `producer_members.active` direto, que é suficiente.
- Não vou mexer em outros buckets.