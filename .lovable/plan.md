## Causa

A policy `INSERT` da tabela `events` exige `producer_id = auth.uid() AND has_role(auth.uid(), 'produtor')`. Sua conta `gabinox54037@gmail.com` tem role `admin` (não `produtor`), por isso o insert é bloqueado pelo RLS quando você clica em "Criar evento" / "Salvar como rascunho". O mesmo padrão se repete em `event_lots`, `event_coupons` e `guest_lists` (todas exigem `producer_id = auth.uid()`).

Já existe a regra na memória do projeto: **admins devem bypassar RLS globalmente**. Falta aplicar isso nessas 4 tabelas.

## Plano de correção

Migração SQL adicionando policies de admin global (ALL = SELECT/INSERT/UPDATE/DELETE) usando `has_role(auth.uid(), 'admin')`:

1. **`events`** — policy `Admins podem gerenciar todos os eventos` (ALL)
2. **`event_lots`** — policy `Admins podem gerenciar todos os lotes` (ALL)
3. **`event_coupons`** — policy `Admins podem gerenciar todos os cupons` (ALL)
4. **`guest_lists`** — policy `Admins podem gerenciar todas as listas` (ALL)

Cada uma com `USING (has_role(auth.uid(), 'admin'))` e `WITH CHECK (has_role(auth.uid(), 'admin'))`.

## Detalhes técnicos

- Como as policies do Postgres são aditivas (OR entre elas), as policies de `produtor` continuam intactas — produtores comuns seguem funcionando exatamente como hoje.
- Admin poderá criar evento informando qualquer `producer_id` (inclusive o próprio `auth.uid()`). O front já envia `producer_id: user.id` em `useEvents.createEvent`, então funciona sem mudança de código.
- Não mexe em código React, apenas RLS no banco.

## Fora de escopo

- Não vou criar um perfil de produtor para a conta admin (você pediu acesso administrativo, não duplicar role).
- Não vou alterar o wizard de criação nem `useEvents`.
- Outras tabelas (orders, tickets, etc.) já têm bypass admin ou não são tocadas no fluxo de criação de evento — não mexo agora.

## Validação

1. Recarregar `/produtor/criar-evento`, completar o wizard e clicar "Criar evento" → deve criar sem erro de RLS.
2. Testar "Salvar como rascunho" → idem.
3. Conferir no `/admin/produtores` ou no dashboard se o evento aparece.
