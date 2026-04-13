

# Corrigir banner do evento no desktop

## Problema
No desktop, o banner lateral tem largura fixa de `w-48` (192px) com `object-cover`, cortando a imagem horizontalmente. O usuário quer que o banner apareça completo (sem corte) na mesma posição lateral, e que os botões de acao saiam para fora do card.

## Solucao

### Desktop (md+)
1. **Aumentar largura do banner**: trocar `md:w-48` por `md:w-72` (288px) e usar `object-contain bg-black/5` para mostrar o banner inteiro sem cortar
2. **Mover botoes para fora do card**: colocar os botoes (Publicar/Despublicar, Editar, Ver Pagina) em uma div acima do card, alinhados a direita, junto com o botao "Voltar para Eventos"
3. **Informacoes permanecem a direita** do banner dentro do card (titulo, badges, data, stats)

### Mobile
- Banner no topo, full width, `h-48`, `object-contain bg-black/5` — sem corte
- Botoes tambem ficam fora do card, acima dele

### Layout desktop final:
```text
[← Voltar]              [Publicar] [Editar] [Ver Pagina]
┌──────────────┬─────────────────────────────┐
│              │  Badges                     │
│   Banner     │  Titulo                     │
│  (w-72,      │  Data / Hora / Local        │
│  contain)    │─────────────────────────────│
│              │  Receita | Vendidos | Dias   │
└──────────────┴─────────────────────────────┘
```

## Arquivo impactado
| Arquivo | Mudanca |
|---|---|
| `src/components/producer/EventDashboardHeader.tsx` | Mover botoes para fora do card, aumentar largura do banner, usar `object-contain` |

## Detalhes tecnicos
- Botoes saem do `div.bg-card` para uma `div flex justify-between` acima do card (mesma linha do "Voltar")
- Banner: `md:w-72 h-auto` com `object-contain bg-black/5 rounded-l-xl`
- Mobile: banner `w-full h-48 object-contain bg-black/5`
- Info permanece em `flex-1 p-6` ao lado do banner

