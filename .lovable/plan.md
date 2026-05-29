## Diagnóstico

1. **Horário, Estado e Status vêm em branco ao abrir Editar Evento.**
   O formulário em `src/pages/EditarEvento.tsx` usa `useForm({ defaultValues, values: formValues, resetOptions: { keepDirtyValues: true } })`. Os campos `time`, `end_time`, `state` e `status` têm valor inicial `''`/`'draft'` em `defaultValues`. Quando o evento chega da API, a RHF não atualiza esses campos controlados via `watch()` (Select da UI). Já a Data funciona porque não tem default (vai de `undefined` → Date).

2. **Imagem do evento aparece preta / não carrega.**
   - Confirmado no storage: a URL salva em `events.image_url` aponta para um arquivo que não existe mais (HTTP 404). Uploads novos do mesmo usuário existem no bucket e retornam 200.
   - O hook `src/hooks/useImageUpload.ts` faz um `fetch(url, { method: 'HEAD' })` pós-upload e retorna `null` se algo falhar. Isso é frágil e, em parte dos cenários, faz com que o `onChange` nunca seja chamado — o preview continua exibindo a URL antiga (quebrada). Storage do Cloud já é consistente após o `upload` resolver: a checagem extra não agrega segurança e atrapalha.

## Plano de correção (somente front)

### A. Hidratação do formulário em Editar Evento

Em `src/pages/EditarEvento.tsx`:

- Remover `values: formValues` e `resetOptions: { keepDirtyValues: true }` do `useForm`.
- Trocar por um `useEffect` que dispara `reset(formValues)` quando `event?.id` mudar (carga inicial do evento ou troca de evento). Isso garante populamento confiável de todos os campos controlados (TimeSelect, Estado, Status, Tipo de venda).
- Manter `defaultValues` enxutos.

### B. Upload de imagem confiável

Em `src/hooks/useImageUpload.ts`:

- Remover o bloco de verificação HEAD pós-upload. Retornar a `publicUrl` imediatamente após `upload` bem-sucedido.
- Manter validações de tipo e tamanho como hoje.

Em `src/components/producer/ImageUpload.tsx`:

- Adicionar tratamento `onError` no `<img>` para detectar URL quebrada (ex.: imagem antiga deletada) e exibir o uploader em vez do quadro preto. Isso resolve o caso visual da imagem antiga sumida.

### C. Verificação

- Abrir um evento existente em `/produtor/editar-evento/:id`: confirmar que Data, Horário, Estado, Status, Tipo de venda e Mapa vêm preenchidos.
- Fazer upload de uma imagem nova: preview deve atualizar para a nova foto e salvar corretamente.
- Abrir um evento com `image_url` quebrado: deve cair no estado de uploader (sem quadro preto travado).
- Nada nas edges, RLS, ou fluxo de pagamento.