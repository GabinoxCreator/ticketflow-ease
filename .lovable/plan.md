

# Ajustes: Cor do Select, Redirecionamento e Botão Publicar/Despublicar

## 1. Cor rosa no SelectItem → cor primária
O `SelectItem` em `src/components/ui/select.tsx` (linha 108) usa `focus:bg-accent` que aponta para `--accent: 330 85% 60%` (rosa). Trocar para `focus:bg-primary focus:text-primary-foreground` para usar a cor principal do projeto (roxo).

## 2. Redirecionar para página do evento após criar
Em `src/pages/CriarEvento.tsx` (linha 231), o `navigate('/produtor/eventos')` será trocado para `navigate(`/produtor/eventos/${eventResult.id}`)` para ir direto ao dashboard do evento criado.

## 3. Botão Publicar/Despublicar no dashboard do evento
Em `src/components/producer/EventDashboardHeader.tsx`, adicionar um botão condicional:
- Se `event.status === 'draft'` → botão "Publicar Evento" (muda status para `published`)
- Se `event.status === 'published'` → botão "Despublicar" (muda status para `draft`)
- Usar `updateEvent` do hook `useEvents` para persistir a mudança e invalidar queries

## Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/components/ui/select.tsx` | `focus:bg-accent` → `focus:bg-primary focus:text-primary-foreground` no SelectItem |
| `src/pages/CriarEvento.tsx` | Redirect para `/produtor/eventos/${eventResult.id}` |
| `src/components/producer/EventDashboardHeader.tsx` | Botão publicar/despublicar com chamada ao updateEvent |

