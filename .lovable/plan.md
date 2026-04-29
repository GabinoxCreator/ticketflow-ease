# Restaurar visual premium dos cards de ingresso

O card que está renderizando hoje é o "antigo" (header simples, stepper pequeno). O print mostra o estilo premium que precisa voltar.

## Mudanças em `src/pages/EventDetails.tsx`

### 1. Container do setor (header roxo + badge)
Substituir o atual (`bg-card rounded-2xl border p-5` com `<h3>` simples) por:
- Card com `bg-card/60 backdrop-blur-xl` + `border-border/60` + `shadow-primary/5`
- **Header em faixa** com gradient `from-primary/15 via-primary/10 to-accent/10`, padding `px-6 py-4`
- Título do setor em `text-primary`, `uppercase`, `tracking-[0.2em]`, `font-bold text-sm`
- **Badge "X opção/opções"** à direita: pill com `bg-background/40 backdrop-blur` + `border-primary/30` + `text-primary/80`
- Lotes separados por `divide-y divide-border/40` (sem padding extra no container)

### 2. `LotCard` (stepper grande em cápsula glass)
Substituir o stepper atual (dois botões circulares pequenos `w-9 h-9` com borda `muted-foreground`) por:
- Padding maior do row: `px-5 md:px-6 py-5`
- Nome do lote: `font-bold text-base` (branco)
- Preço: `text-2xl font-bold` (mantém moeda BRL)
- **Stepper em cápsula única**: container `rounded-full bg-background/40 backdrop-blur-sm border border-border/50 px-1.5 py-1.5` contendo:
  - Botão `−` circular `w-10 h-10 rounded-full border border-border/60 bg-background/60 hover:bg-primary/20 hover:border-primary/50`
  - Quantidade central `w-8 text-center text-lg font-semibold` (muted quando 0, branco quando >0)
  - Botão `+` circular igual ao `−`
- Quando `quantity > 0`: cápsula ganha `border-primary/50` para destacar seleção

## O que NÃO muda
- Lógica de `handleQuantityChange`, limites (max 10, available)
- Agrupamento por setor
- Badge "Esgotado" / "Últimos"
- Hero, sidebar, bottom bar, "Sobre o evento"

## Arquivo modificado
- `src/pages/EventDetails.tsx` (apenas o bloco de tickets ~linhas 354-380 e o componente `LotCard` ~linhas 510-602)
