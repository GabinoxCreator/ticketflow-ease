# Banner do evento sumiu — diagnóstico e correção

## O que aconteceu

O evento "Lançamento Audiovisual Feliz no Simples Miguel Lourenço…" tem `image_url` apontando para:

```
.../event-images/events/1779309004256-tdl0v6tfpch.png
```

Esse arquivo **não existe** no storage (retorna 404). Por isso o card aparece "vazio" no topo — o `<img>` quebra e mostra apenas o alt text (o título) sobre o fundo do card. O arquivo anterior do mesmo produtor, `events/1779308948804-romwigxxxi.png` (subido ~55s antes), continua no bucket.

Provavelmente houve uma troca de imagem em que o segundo upload falhou silenciosamente (rede ou erro temporário), mas a URL "publicUrl" foi salva no banco mesmo assim — `supabase.storage.getPublicUrl()` devolve uma URL formatada independente de o arquivo existir.

## Correções

### 1. Restaurar o banner do evento (dado)

Migration de UPDATE para apontar o evento ao último arquivo válido daquele produtor:

```sql
update public.events
set image_url = 'https://nsrromaqysgoxqvqagdm.supabase.co/storage/v1/object/public/event-images/events/1779308948804-romwigxxxi.png'
where id = '61d0b7dc-e789-4f81-b72f-e2567eee995b';
```

(Se a imagem antiga não for a desejada, basta o usuário fazer um novo upload em "Editar Evento".)

### 2. Fallback visual no card público (`src/components/EventCard.tsx`)

Adicionar `onError` no `<img>` para, quando a URL quebrar, esconder o `<img>` e mostrar o gradiente/placeholder já existente em outros componentes. Assim, mesmo que uma URL fique órfã, o card não fica "destruído".

### 3. Endurecer o upload (`src/hooks/useImageUpload.ts`)

Após o `upload` bem-sucedido, fazer um `fetch` HEAD na `publicUrl` antes de retornar. Se 404, descartar a URL e mostrar erro. Isso evita salvar URLs órfãs no banco no futuro.

## Fora do escopo

- Não vamos mexer em RLS de storage (políticas atuais permitem produtor/admin).
- Não vamos limpar outros eventos sem confirmação — só esse específico.

## Validação manual

- Home volta a mostrar o banner do evento.
- Em `Editar Evento`, trocar imagem por uma inválida (forçar erro) mostra toast e **não** salva URL no formulário.
- Card de evento com URL quebrada cai no placeholder com gradiente em vez de mostrar o título sobreposto.
