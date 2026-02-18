
# Simplificar Cards de Eventos na Pagina Inicial

## O que sera feito

Remover dois elementos dos cards de eventos na tela inicial:
1. A descricao curta do evento (texto "OPPS" no exemplo)
2. A barra de progresso com "X% vendido" e "X restantes"

## Alteracoes

### Arquivo: `src/components/EventCard.tsx`

1. **Remover descricao** (linhas 91-93): remover o bloco `<p>` com `event.shortDescription`
2. **Remover barra de progresso** (linhas 101-113): remover todo o bloco `mb-3` que contem os textos de porcentagem vendida, restantes, e a barra de progresso
3. **Remover variavel nao utilizada** (linha 40): remover `soldPercentage` que nao sera mais necessario

O card ficara com: titulo, local/horario, preco e botao "Ver Ingressos".
