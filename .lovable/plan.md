# Editor de evento: corrigir campos zerados e botão voltar

## Problema 1 — Campos resetam ao abrir editar

`src/pages/EditarEvento.tsx` carrega o evento e chama `reset(...)` num `useEffect`. Os campos com input nativo (`title`, `description`, `venue`, `city`, `address`) recebem o valor via `register` + DOM e funcionam.

Já os campos controlados via `watchedValues.X` + Radix `<Select>` (**Horário de início**, **Horário de fim**, **Estado**, **Status**) ficam **vazios** porque o `watch()` no primeiro render devolve os `defaultValues` (`status: 'draft'`, demais `''`) e o Radix Select já fixa esse valor no trigger antes do `reset` rodar. Quando o reset acontece, o `value` do Select muda para a string nova mas o trigger não re-renderiza com o item correspondente porque os `SelectItem` não mudam de identidade.

Confirmado pelo banco: o evento tem `time=17:00:00`, `end_time=23:30:00`, `state=SP`, `status=published` — dados válidos, encaixam nas opções (TimeSelect tem grade de 15 min, 17:00 e 23:30 existem).

### Correção

Trocar o padrão `useEffect + reset` por `useForm({ values })` (RHF ≥ 7.43): a prop `values` mantém o form **sincronizado** com a fonte externa toda vez que `event` mudar, e dispara re-render dos controlled fields corretamente.

```ts
const formValues = useMemo(() => {
  if (!event) return undefined;
  return {
    title: event.title ?? '',
    description: event.description ?? '',
    date: event.date ? parseISO(`${event.date}T12:00:00`) : undefined as any,
    time: event.time ? event.time.slice(0, 5) : '',
    end_date: event.end_date ? parseISO(`${event.end_date}T12:00:00`) : null,
    end_time: event.end_time ? event.end_time.slice(0, 5) : '',
    venue: event.venue ?? '',
    city: event.city ?? '',
    state: event.state ?? '',
    address: event.address ?? '',
    is_hot: !!event.is_hot,
    status: event.status,
  };
}, [event]);

const form = useForm<EventFormData>({
  resolver: zodResolver(eventSchema),
  defaultValues: { /* mesmos placeholders de hoje */ },
  values: formValues,           // <— sincroniza quando o evento chegar
  resetOptions: { keepDirtyValues: true },
});
```

Remover o `useEffect` que chamava `reset(...)` (passa a ser redundante e pode reverter edições do usuário). O `setImageUrl(event.image_url)` migra para um `useEffect` separado (só seta uma vez).

## Problema 2 — Botão voltar leva para a lista de todos os eventos

Linha ~223:

```tsx
<Button variant="ghost" size="icon" onClick={() => navigate('/produtor/eventos')}>
  <ArrowLeft />
</Button>
```

Deve voltar para o **dashboard do evento** que está sendo editado: `/produtor/eventos/:id`.

### Correção

```tsx
<Button variant="ghost" size="icon" onClick={() => navigate(`/produtor/eventos/${id}`)}>
  <ArrowLeft />
</Button>
```

Manter o botão "Voltar para Meus Eventos" do estado de evento-não-encontrado (linha 205) apontando pra `/produtor/eventos` — esse caso não tem evento contextual.

`onSuccess` do delete (linha 185) também segue indo pra `/produtor/eventos` (correto: o evento foi excluído).

## O que NÃO muda

- Schema zod, mutation, banco.
- Comportamento do `LotManager`, `ImageUpload`, `TimeSelect`.
- Estilos.

## Arquivos tocados

- `src/pages/EditarEvento.tsx` (apenas)

## Validação manual

1. `/produtor/eventos/:id` → clicar **Editar** → todos os campos pré-preenchidos, incluindo Horário de Início, Horário de Fim, Estado (UF) e Status.
2. Alterar a descrição e clicar **Salvar Alterações** → salva sem perder Horário/Estado/Status.
3. Clicar na seta **Voltar** → volta para `/produtor/eventos/:id` (não para a lista).
