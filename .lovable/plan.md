## Redesign Premium do Wizard de Criação de Evento

Objetivo: deixar `/produtor/criar-evento` com a mesma identidade premium do resto do FestPag (dark com gradiente Indigo→Magenta, glass, glows sutis, hierarquia visual forte) sem mudar a lógica do formulário, validações ou submit.

### 1. Header + Stepper premium (substitui linhas 244-271)

- Header em linha única, alinhado: botão voltar (glass redondo) + título com gradiente Indigo→Magenta + subtítulo "Configure seu evento em 4 passos rápidos" abaixo, em `text-muted-foreground`.
- Stepper full-width em card glass (`bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl p-4`):
  - Bolinhas maiores (w-9 h-9), ativas com gradiente Indigo→Magenta + `shadow-[0_0_20px_-4px_hsl(var(--primary)/0.5)]`, completas com check em verde-esmeralda suave, futuras em `bg-muted/40 border border-border`.
  - Conector vira barra fina (`h-1 rounded-full`), preenchida com gradiente conforme avanço.
  - Labels visíveis em `md:` para cima (não só `lg:`), em `text-xs font-medium`.
  - Mobile: stepper rola horizontalmente sem quebrar (`overflow-x-auto`, sem scrollbar) e mostra apenas bolinha + label do passo ativo.

### 2. Card de cada step com identidade premium (envolve todos os steps)

Trocar o `<Card>` padrão pelo padrão glass usado em outras telas:

```tsx
<div className="relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden">
  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
  <div className="p-6 md:p-8 space-y-6">{/* conteúdo */}</div>
</div>
```

Cada step ganha um mini-cabeçalho dentro do card: ícone em chip com gradiente (`w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-[hsl(330,85%,60%)]/20 border border-primary/20`), título do passo e linha de apoio.

- Step 1 — `Sparkles` "Vamos começar pelo básico"
- Step 2 — `CalendarDays` "Quando e onde acontece"
- Step 3 — `Ticket` "Configure os ingressos"
- Step 4 — `Eye` "Pré-visualização final"

### 3. Step 1 — Dados do Evento

- Inputs com `h-11`, `bg-background/50`, `border-border/60`, `focus-visible:ring-primary/40`, `rounded-xl`.
- Textarea: 5 linhas, mesmo estilo, com contador discreto no canto inferior direito (`{description.length} caracteres`).
- ImageUpload: passar variante "premium" via classe — atualizar `ImageUpload.tsx` para aceitar opcionalmente classes que deixem a área de drop com gradiente sutil (`bg-gradient-to-br from-primary/5 via-transparent to-[hsl(330,85%,60%)]/5`), borda tracejada `border-primary/20`, ícone num círculo glow. Mantém toda a lógica intacta.

### 4. Step 2 — Data e Local

- Subseções com mini-headers ("Quando" e "Onde") em uppercase, tracking-wider, com linha-divisória degradê embaixo.
- Pickers de data: botão com `h-11`, ícone calendar em chip primary/10, valor em `font-medium` quando preenchido.
- Bloco de duração calculada vira pill com gradiente sutil: `bg-gradient-to-r from-primary/10 to-[hsl(330,85%,60%)]/10 border border-primary/20`.
- Select de UF e inputs com mesmo padrão.

### 5. Step 3 — Ingressos

- Cada lote vira um card glass com indicador lateral colorido (barra `w-1` à esquerda em gradiente).
- Header do lote: badge "Lote N" com gradiente + setor editável + botão remover destrutivo discreto.
- Período de vendas: os 3 botões viram "segmented control" pill (`p-1 bg-muted/40 rounded-xl` com pílula ativa em gradiente).
- Blocos "Ingresso em Grupo" e "Escassez Fictícia": fundo `bg-background/40` com borda `border-primary/10`, ícone num chip colorido (Users → primary, Flame → orange).
- Botão "Adicionar Ingresso": full-width tracejado com gradiente no hover, ícone Plus num chip.

### 6. Step 4 — Revisão

- Já está bem montado; ajustes:
  - Borda do article para `border-primary/10` e adicionar leve glow `shadow-[0_0_40px_-12px_hsl(var(--primary)/0.3)]`.
  - Cards de ingresso com mesmo padrão glass dos outros steps.
  - Adicionar chip de status ("Pronto para publicar") no topo direito do banner.

### 7. Barra de navegação (rodapé do wizard)

Substituir os botões soltos por uma barra sticky no fundo do conteúdo:

```tsx
<div className="sticky bottom-4 mt-6 rounded-2xl border border-primary/10 bg-card/70 backdrop-blur-xl p-3 flex items-center justify-between">
  <Button variant="ghost" /* Anterior */ />
  <span className="text-xs text-muted-foreground hidden md:block">Passo {currentStep} de 4</span>
  <Button variant="gradient" /* Próximo / Publicar */ />
</div>
```

No step 4, dois botões: "Salvar como rascunho" (outline) e "Publicar evento" (gradient hero).

### 8. Responsividade

- `max-w-5xl` em vez de `max-w-6xl` para conforto de leitura.
- Padding lateral mobile: `px-4` no container.
- Stepper mobile: scroll horizontal sem quebra, conforme item 1.
- Grids do Step 2 e 3 já são responsivos; revisar gaps para `gap-4` no mobile.

### Arquivos modificados

- `src/pages/CriarEvento.tsx` — toda a reformulação visual descrita (lógica intacta).
- `src/components/producer/ImageUpload.tsx` — aceitar `dropClassName` opcional (ou aplicar visual premium por padrão, mantendo a API).

### Fora de escopo

- Sem mudanças em `useEvents`, no schema ou em validações.
- Sem mudanças no fluxo de submit/draft/publicar.
- Sem mudanças em outras páginas do produtor.
