

# Ajustes de UX na Criação de Evento

## Mudanças

### 1. Etapa 1 — Imagem abaixo da descrição
- Mudar layout de `grid-cols-[1fr,200px]` (imagem ao lado) para layout vertical: Título → Descrição → Imagem (abaixo, largura total, altura controlada ~h-48)

### 2. Expandir container e preencher espaço
- Trocar `max-w-4xl` por `max-w-6xl` para usar mais a tela
- Aumentar padding interno dos cards de `p-5` para `p-6` ou `p-8`
- Aumentar espaçamento entre campos (`gap-4` → `gap-6`)
- Garantir que cada etapa preencha visualmente a área sem scroll

### 3. Etapa 2 — "Duração do Evento"
- Mudar texto de "Duração:" para "Duração do Evento:"

### 4. Bug de data (off-by-one no Calendar)
- O problema é timezone: `format(d, 'yyyy-MM-dd')` usa data local, mas `new Date('2026-04-13')` interpreta como UTC, causando shift de 1 dia
- Corrigir armazenando o objeto `Date` diretamente nos lots (como já é feito no step 2) ou usando `format(d, 'yyyy-MM-dd')` com parse correto via `new Date(lot.start_date + 'T00:00:00')`

### 5. Cor rosa no calendário (focus ring)
- Na `calendar.tsx`, o `[&:has([aria-selected])]:bg-accent` no `cell` é que gera o rosa
- Trocar `bg-accent` → `bg-primary/20` e `bg-accent/50` → `bg-primary/10` no cell class

### 6. Etapa 4 — Revisão expandida
- Banner/imagem no topo com largura total (h-48, rounded, object-cover)
- Título grande sobre ou abaixo da imagem
- Dados do evento em grid mais espaçado (3 colunas)
- Ingressos em cards mais visuais (não apenas linhas compactas)
- Simular visual de "página de vendas" com hierarquia clara

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Layout, bug de data, expansão, revisão visual |
| `src/components/ui/calendar.tsx` | Cor do cell selected background (rosa → primary) |

