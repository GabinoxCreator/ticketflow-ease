
# Corrigir Layout e Reorganizar Pagina de Evento

## Mudancas

### 1. Centralizar cards no mobile
O `container` com `px-4` pode nao estar centralizando corretamente. Vou garantir que o grid e os cards fiquem centralizados com `mx-auto` e largura maxima adequada.

### 2. Reordenar: Ingressos ANTES de "Sobre o evento"
Dentro do primeiro card (motion.div), a ordem atual e:
- Badge de categoria
- Titulo
- Data/hora
- Local
- "Sobre o evento" (descricao)
- Barra de progresso (% vendido)

A nova ordem sera:
- Badge de categoria
- Titulo
- Data/hora
- Local
- (Sem "Sobre o evento" aqui - movido para depois dos ingressos)

O bloco de "Escolha seus ingressos" vem logo depois, e ABAIXO dele um novo card com "Sobre o evento".

### 3. Remover secao "% vendido / ingressos restantes"
- Remover o bloco de progresso geral do evento (linhas 234-259)
- Remover tambem a barra de scarcity de cada lote individual (linhas 430-457)
- Remover o texto "X disponiveis" de cada lote (linhas 460-464)

---

## Detalhes Tecnicos

**Arquivo: `src/pages/EventDetails.tsx`**

**Card principal (linhas 195-260):**
- Remover linhas 229-259 (secao "Sobre o evento" + bloco de progresso)
- O card fica apenas com: badge, titulo, data/hora, local

**Bloco de ingressos (linhas 262-286):**
- Permanece igual, logo abaixo do card principal

**Novo card "Sobre o evento":**
- Adicionar ABAIXO do bloco de ingressos
- Contem apenas o titulo "Sobre o evento" e a descricao

**LotCard (linhas 430-464):**
- Remover o bloco de scarcity bar (linhas 430-457)
- Remover o texto "X disponiveis" (linhas 460-464)

**Centralizacao:**
- Adicionar `mx-auto` na section de conteudo para garantir centralizacao
