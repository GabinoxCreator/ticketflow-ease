# Exibir escassez na página do evento

## Problema

No painel do produtor, cada lote tem dois campos de escassez:

- `fake_scarcity_enabled` (bool)
- `fake_scarcity_percentage` (10–95)

Esses campos já vêm do banco em `usePublicEvents` / `useEvent` e estão tipados em `EventDetails.tsx` (`EventLot.fake_scarcity_enabled`, `fake_scarcity_percentage`). **Mas o componente `LotCard` não usa nenhum dos dois.** Hoje só aparece:

- Badge "Esgotado" quando `available === 0`
- Badge "Últimos" quando `available < 50` (número fixo, ignora capacidade do lote)

Resultado: o produtor liga a escassez no painel, e na página do evento nada muda.

## Objetivo

Mostrar escassez no `LotCard` da página `/evento/:id` respeitando a configuração do produtor, sem alterar lógica de venda/estoque.

## Mudanças (somente UI, em `src/pages/EventDetails.tsx` → `LotCard`)

### 1. Calcular percentual exibido

```text
realPct  = sold_quantity / total_quantity * 100
fakePct  = fake_scarcity_enabled ? fake_scarcity_percentage : 0
shownPct = clamp(max(realPct, fakePct), 0, 100)
```

Regra: a escassez fake nunca reduz a real — só "infla" a sensação de venda.

### 2. Substituir o badge fixo "Últimos < 50"

Novo gatilho baseado em `shownPct`:

- `shownPct >= 100` ou `available === 0` → badge **Esgotado** (mantém)
- `shownPct >= 90` → badge **Últimas unidades** (destructive, com ícone)
- `shownPct >= 70` → badge **Quase esgotado** (warning/secondary)
- caso contrário → sem badge

Mantém também a regra real `available <= 10` como fallback de "Últimas unidades" mesmo sem fake habilitado.

### 3. Barra de progresso de escassez

Quando `fake_scarcity_enabled` **ou** `shownPct >= 70`:

- Renderizar um `<Progress value={shownPct} />` fino abaixo do preço
- Texto auxiliar: `"{Math.round(shownPct)}% vendido"` em `text-muted-foreground text-xs`
- Cor: usar a cor primary; quando `shownPct >= 90`, trocar para tom destructive via classe condicional

### 4. Não mostrar números reais

Nunca exibir `sold_quantity` / `total_quantity` brutos (mantém o "fake" crível). Apenas percentual arredondado.

## O que NÃO muda

- Hooks (`useEvent`, `usePublicEvents`) — já trazem os campos.
- Banco / RLS / edge functions.
- Lógica de `available`, carrinho, checkout.
- Painel do produtor.

## Arquivos tocados

- `src/pages/EventDetails.tsx` (apenas o componente interno `LotCard`, ~linhas 584–625)

## Teste manual

1. No painel do produtor, ligar escassez em um lote com 50%.
2. Abrir `/evento/:id` → ver badge "Quase esgotado" + barra em ~50%.
3. Subir para 92% → badge "Últimas unidades" + barra destructive.
4. Desligar escassez → badges só aparecem se venda real for alta.
5. Lote esgotado (sold = total) → badge "Esgotado" continua, controles somem.
