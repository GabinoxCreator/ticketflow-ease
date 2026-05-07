# Corrigir falha ao salvar alterações no evento

## Diagnóstico

Ao analisar `src/pages/EditarEvento.tsx` e os dados do banco, identifiquei **dois bugs** que impedem (ou parecem impedir) salvar a edição:

### Bug 1 — Horário com segundos não casa com as opções do TimeSelect
- No banco, `events.time` é armazenado como `15:00:00` (formato `HH:MM:SS`).
- O `TimeSelect` gera opções no formato `HH:MM` (`19:00`, `19:15`, ...).
- Quando o formulário carrega o evento, faz `time: event.time` ⇒ `"15:00:00"` — esse valor **não existe** na lista, então o select aparece vazio até o produtor escolher um novo horário. Confunde o usuário e quebra o estado controlado.

### Bug 2 — Estado (UF) não é exibido após carregar o evento
- O DB tem `state = "SP"`, mas no screenshot o campo "Estado" aparece vazio.
- O `<SelectValue />` está sem `placeholder` e sem fallback. Suspeita: por algum motivo o `setValue` durante `reset` está sendo sobrescrito, OU o trigger não está exibindo o valor por falta de `placeholder` em estado inicial.
- Quando o produtor tenta salvar, a validação Zod `state: z.string().min(2)` falha **silenciosamente** porque não há `<p>` mostrando `errors.state.message` no JSX. O `handleSubmit` simplesmente não chama `onSubmit` e a UI não dá feedback — daí a sensação de "não consegui salvar".

### Bug 3 (menor) — Sem feedback de erros de validação no Select
- Os campos `state`, `date`, `time`, `end_time` não renderizam mensagens de erro do Zod. Se qualquer um falhar, o botão "Salvar" parece não fazer nada.

## O que vou alterar

Apenas `src/pages/EditarEvento.tsx`:

1. **Normalizar `time` e `end_time` ao carregar** o evento:
   ```ts
   time: (event.time || '').slice(0, 5),
   end_time: (event.end_time || '').slice(0, 5),
   ```
2. **Garantir que o Select de Estado exiba o valor**:
   - Adicionar `placeholder="UF"` no `<SelectValue placeholder="UF" />`.
   - Forçar `value={watchedValues.state || ''}` (já é o caso, mas garantir).
3. **Mostrar mensagens de erro** abaixo dos campos `state`, `date`, `time` (Zod errors) — assim o produtor vê o motivo se a validação falhar.
4. **Toast de erro de validação**: passar um segundo callback ao `handleSubmit(onSubmit, onInvalid)` que mostre `toast.error('Verifique os campos obrigatórios')` se houver campos inválidos.

## Fora do escopo

- Não vou mexer em `useEvents.ts`, hooks de lotes, ou regras de negócio.
- Não mexo em RLS, autenticação ou outros formulários.

## Checklist de validação manual

1. Abrir `/produtor/editar-evento/<id>` de um evento existente.
2. Conferir que o Horário aparece já preenchido (ex: `15:00`).
3. Conferir que o Estado aparece preenchido (ex: `SP`).
4. Mudar o horário para outro valor e clicar em "Salvar Alterações" — toast de sucesso.
5. Apagar o estado e tentar salvar — deve aparecer mensagem de erro visível.
