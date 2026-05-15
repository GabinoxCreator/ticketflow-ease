# Mostrar quais campos estão bloqueando o salvamento

## Problema

Em `EditarEvento.tsx` linha 229:

```ts
<form onSubmit={handleSubmit(onSubmit, () => toast.error('Verifique os campos obrigatórios destacados'))}>
```

O `onInvalid` dispara um toast genérico, mas só renderiza erro inline em **6 campos** (title, date, time, venue, city, state). Se a validação falhar em qualquer outro campo (`end_date`, `end_time`, `address`, `is_hot`, `status`, `description`) ou se algum erro vier do `reset` desincronizado (ex.: `time` salvo como string vazia, `date` inválida vinda do `parseISO`), o usuário vê o toast e nada em vermelho — exatamente o sintoma da captura.

Mais provável neste caso: o `event.date` ou `event.time` voltou nulo/vazio do banco para o título recém-criado, e o `parseISO`/`slice` produziu valor inválido sem feedback visual.

## Correção

### 1. Toast com nomes dos campos inválidos

Mapear cada chave do schema para um label em PT-BR e listar no toast:

```ts
const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descrição',
  date: 'Data de início',
  time: 'Horário',
  end_date: 'Data de término',
  end_time: 'Horário de término',
  venue: 'Local',
  city: 'Cidade',
  state: 'Estado',
  address: 'Endereço',
  is_hot: 'Destaque',
  status: 'Status',
};

const onInvalid = (errs: FieldErrors<EventFormData>) => {
  const fields = Object.keys(errs).map(k => FIELD_LABELS[k] ?? k);
  toast.error('Corrija os campos:', { description: fields.join(', ') });
  // foca o primeiro
  const first = Object.keys(errs)[0];
  if (first) {
    document.getElementById(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};
```

### 2. Render de erro nos campos hoje "mudos"

Adicionar `{errors.end_date && ...}` e `{errors.end_time && ...}` abaixo dos respectivos inputs (linhas ~290–315) e `{errors.status && ...}` abaixo do `Select` de status (linha ~402). Mesmo padrão `<p className="text-sm text-destructive">`.

### 3. Sanitizar reset

No `useEffect` que faz `reset(...)` (linha 109):

- `time: event.time ? event.time.slice(0, 5) : ''` — já está, mas garantir que string vazia não passe no `min(1)`. Se `event.time` vier vazio, manter vazio (form força produtor a preencher antes de salvar — comportamento correto, agora visível).
- `date: event.date ? parseISO(event.date) : undefined` — evita `Invalid Date` silencioso.
- `end_date: event.end_date ? parseISO(event.end_date) : null`.

## O que NÃO muda

- Schema zod (regras continuam iguais).
- Mutation / API.
- Banco.

## Arquivos tocados

- `src/pages/EditarEvento.tsx`

## Validação manual

1. Abrir o evento problemático em `/produtor/editar-evento/:id` e clicar em **Salvar**.
2. Toast deve listar exatamente o(s) campo(s) com problema (ex.: "Horário de término").
3. A página rola até o campo e mostra mensagem em vermelho embaixo dele.
4. Após corrigir, salvar funciona normalmente.
