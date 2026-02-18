
# Redesign da Pagina de Detalhes do Evento - Estilo Ze do Ingresso

## Analise da Referencia vs Layout Atual

O layout de referencia (Ze do Ingresso) tem uma estrutura muito mais simples e limpa no mobile:

**Referencia:**
1. Banner edge-to-edge (sem bordas arredondadas)
2. Titulo grande e bold diretamente sobre o fundo escuro (SEM card)
3. Cidade/Estado como texto simples abaixo do titulo
4. Nome do local em cor de destaque (sem card/box)
5. Data e hora com icones, inline, sem card
6. Secao "INGRESSOS" em um card escuro com borda sutil, lotes separados por divisores simples (linha horizontal)
7. Cada lote: nome + preco na esquerda, botoes +/- na direita, visual limpo
8. Descricao do evento sem card, texto direto
9. SEM sidebar de "Resumo" no mobile - tudo eh coluna unica
10. Botao de compra fixo no rodape (floating bottom bar)

**Layout Atual:**
- Tudo dentro de cards com bordas e fundo (`bg-card rounded-2xl border`)
- Badge de categoria no topo
- Sidebar "Resumo" sempre visivel (ocupa espaco no mobile)
- Info do local dentro de um box com fundo secondary
- Lotes cada um com card individual com borda

## Mudancas Planejadas

### 1. `src/pages/EventDetails.tsx` - Reestruturacao do layout mobile

**Banner:**
- Manter como esta (edge-to-edge, object-contain)
- Remover negative margin overlap no mobile (`-mt-8` somente no desktop)

**Secao de informacoes (titulo, local, data):**
- Remover o card wrapper (`bg-card rounded-2xl border`) no mobile
- Titulo grande e bold direto no fundo
- Cidade/Estado como texto simples
- Nome do local em cor `text-primary` (verde)
- Data e hora inline com icones

**Secao de Ingressos:**
- Manter o card wrapper mas simplificar
- Titulo "INGRESSOS" em uppercase, bold
- Lotes separados por `border-b` (divider) em vez de cards individuais
- Layout de cada lote: nome em cima, preco embaixo a esquerda, botoes +/- a direita
- Botoes +/- com estilo circular outline (como na referencia)

**Sidebar "Resumo":**
- Esconder no mobile (`hidden lg:block`)
- Adicionar barra fixa no rodape do mobile com total + botao "Comprar Ingressos"

**Descricao "Sobre o evento":**
- Remover card wrapper
- Titulo bold + texto direto

### 2. Componente `LotCard` - Redesign

- Remover borda/card individual
- Usar divisor horizontal entre lotes
- Layout mais clean: nome bold, preco abaixo, controles a direita

### 3. Barra fixa de compra no mobile

- Barra fixa no `bottom-0` com fundo card + border-top
- Mostra total e botao "Comprar Ingressos"
- Aparece somente quando ha ingressos selecionados
- Apenas visivel em mobile (`lg:hidden`)

## Detalhes Tecnicos

### Arquivo: `src/pages/EventDetails.tsx`

**Secao de conteudo (linha ~191):**
- Remover negative margin no mobile: de `-mt-8 md:-mt-16 lg:-mt-32` para `mt-0 lg:-mt-32`
- Grid: manter `lg:grid-cols-3` mas a sidebar fica `hidden lg:block`

**Card de info (linhas ~195-229):**
- Remover classes `bg-card rounded-2xl border border-border p-6 md:p-8`
- Usar apenas `py-6` no mobile
- Remover Badge de categoria
- Titulo: manter `font-bold text-3xl md:text-4xl`
- Abaixo do titulo: `{event.city}, {event.state}` em texto muted
- Local: `{event.venue}` em `text-primary font-semibold` (sem box de fundo)
- Data e hora: icones + texto inline

**Card de lotes (linhas ~232-254):**
- Manter card com borda (`bg-card rounded-2xl border`)
- Titulo: "INGRESSOS" em `uppercase font-bold tracking-wider`
- Separador horizontal apos o titulo
- Lotes separados por `border-b` em vez de cards

**LotCard (linhas ~356-441):**
- Remover container com borda arredondada
- Usar `py-4 border-b border-border last:border-b-0`
- Nome em `font-bold uppercase text-sm tracking-wide`
- Preco abaixo do nome em texto normal
- Botoes +/- circulares com `rounded-full border border-muted-foreground`

**Sobre o evento (linhas ~258-270):**
- Remover card wrapper
- Titulo: `font-bold text-xl mb-4`
- Texto: `text-muted-foreground leading-relaxed`

**Sidebar Resumo (linhas ~273-325):**
- Adicionar `hidden lg:block` ao wrapper

**Nova: Barra fixa mobile (apos o Footer):**
- `fixed bottom-0 left-0 right-0 lg:hidden` com `bg-card border-t border-border p-4`
- Exibe total a esquerda e botao a direita
- So aparece quando `totalTickets > 0`
- Adicionar `pb-24` no main quando ha tickets selecionados (para nao cobrir conteudo)

### Resumo de arquivos alterados
- `src/pages/EventDetails.tsx` - Unico arquivo modificado (redesign do layout + LotCard + barra fixa)

### Checklist de testes
- [ ] Mobile 360px: cards centralizados, sem overflow horizontal
- [ ] Mobile 390px: layout identico, gutters iguais
- [ ] Selecionar ingressos: barra fixa aparece no rodape
- [ ] Clicar "Comprar" na barra fixa abre o checkout modal
- [ ] Desktop: sidebar "Resumo" visivel, layout 3 colunas mantido
- [ ] Botoes Voltar/Compartilhar/Favoritar funcionando
- [ ] Descricao do evento exibida corretamente
