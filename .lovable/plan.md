## Diagnóstico

Verifiquei o evento **Brasil x Haiti — Copa do Mundo na Estação Sambar** no banco:

- `producer_profiles.meta_pixel_id` = `1159549545767988`
- `producer_profiles.tracking_enabled` = `true`

A configuração está correta. O Pixel **não dispara no site público** por causa de RLS, não de configuração.

### Causa raiz

`useEvent()` faz embed `events → producer_profiles ( brand_name, logo_url, meta_pixel_id, tracking_enabled )`. Mas a tabela `producer_profiles` **não tem policy de SELECT para visitantes anônimos** (só admins e membros da organização). Para qualquer usuário deslogado (o caso da página pública do evento), o embed retorna `null`, então `pixelId` em `EventDetails.tsx` resolve para `null` e `trackPageView` / `trackViewContent` nunca rodam. Por isso o Meta Pixel Helper não detecta nada.

Não dá para simplesmente abrir `producer_profiles` ao público — a tabela tem dados sensíveis (`document`, `email`, `phone`, `legal_name`).

## Plano de correção

### 1. Backend — RPC pública só para os campos de tracking

Migration nova criando função `SECURITY DEFINER`:

```sql
create or replace function public.get_event_tracking(_event_id uuid)
returns table (meta_pixel_id text, tracking_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pp.meta_pixel_id, pp.tracking_enabled
  from events e
  join producer_profiles pp on pp.id = e.producer_profile_id
  where e.id = _event_id
    and coalesce(pp.tracking_enabled, false) = true
    and pp.meta_pixel_id is not null;
$$;

grant execute on function public.get_event_tracking(uuid) to anon, authenticated;
```

Expõe **apenas** pixel id + flag, e somente quando o produtor optou por tracking. Nada sensível vaza.

### 2. Frontend — `src/pages/EventDetails.tsx`

Trocar a leitura atual:

```ts
const pixelId =
  event?.producer_profiles?.tracking_enabled
    ? event?.producer_profiles?.meta_pixel_id ?? null
    : null;
```

por uma chamada à RPC quando o evento carregar:

```ts
const [pixelId, setPixelId] = useState<string | null>(null);
useEffect(() => {
  if (!event?.id) return;
  supabase.rpc('get_event_tracking', { _event_id: event.id })
    .then(({ data }) => setPixelId(data?.[0]?.meta_pixel_id ?? null));
}, [event?.id]);
```

O resto da lógica (`trackPageView`, `trackViewContent`, `trackInitiateCheckout`) permanece igual.

### 3. Validação

Após o deploy:
1. Abrir `https://festpag.com.br/evento/brasil-x-haiti-...` em aba anônima.
2. Meta Pixel Helper deve mostrar o pixel `1159549545767988` com eventos `PageView` e `ViewContent`.
3. Iniciar checkout deve disparar `InitiateCheckout`.

## Fora do escopo

- Não vou abrir `producer_profiles` ao público.
- Não vou tocar em outros caminhos (checkout server-side, Conversions API). Se quiser CAPI no futuro, fica para outro plano.