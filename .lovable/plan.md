# Repaginar Vender + Relatórios (Colaborador)

Escopo restrito: **só** o modal "Venda na Portaria" (`ColaboradorVenderModal.tsx`) + aba "Vender" (`ColaboradorVenderTab.tsx`) + aba "Relatórios" (`ColaboradorRelatoriosTab.tsx`). Nada fora disso muda.

## 1. Nova paleta — claro com acentos coloridos

- Fundo geral: branco / `slate-50`
- Cards e superfícies: branco com bordas suaves `slate-200` e sombra leve
- Texto principal: `slate-900`, secundário: `slate-500`
- Acentos pastéis preservando a leitura atual:
  - Entraram → verde pastel (`emerald-50` bg / `emerald-600` texto)
  - Aguardando → âmbar pastel (`amber-50` / `amber-600`)
  - Total → roxo pastel (`violet-50` / `violet-600`)
  - CTA "Nova Venda" → verde sólido `emerald-600` (mantém destaque)
  - Vendas / Total R$ → verde pastel
- "Últimas vendas" deixa de ser bloco escuro: vira card branco com bordas e itens em linha.

## 2. Modal Venda na Portaria — UX

**Resumo fixo no topo (sticky)** em ambos os passos:

```text
┌──────────────────────────────────┐
│ Ingresso Antecipado   Qtd: 2     │
│                       R$ 60,00   │
└──────────────────────────────────┘
```

**Passo 1 — Lote + Quantidade (mesma tela):**
- Lista de lotes em cards selecionáveis (radio visual)
- Bloco de Quantidade:
  - Botão `−` e `+` grandes (h-14 w-14, ícones 24px)
  - Input central grande (text-2xl, h-14)
  - **Atalhos rápidos:** chips `1` `2` `5` `10` abaixo do input
  - Validação: respeita `disponíveis` do lote
- Botão "Continuar" full-width, alto (h-12)

**Passo 2 — Pagamento:**
- Resumo fixo continua visível
- Grid 2x2 de meios de pagamento com ícones grandes e fundo claro, borda destacada no selecionado
- Botões "Voltar" + "Confirmar Venda" em rodapé

**Feedback de sucesso:**
- Ao confirmar: substitui conteúdo do modal por tela de sucesso (check verde grande + "Venda registrada!" + valor + meio de pagamento) por ~1,5s
- Toast sonner `toast.success` complementar
- Depois fecha o modal e atualiza KPIs

## 3. Aba Relatórios

- Mesma paleta clara
- KPI cards brancos com ícone colorido em círculo pastel
- Breakdowns (por lote / método / operador) viram tabelas/listas em cards brancos com divisórias `slate-100`
- Badges de método de pagamento em cores pastéis (PIX verde, Dinheiro âmbar, Débito azul, Crédito violeta)

## Arquivos a editar

- `src/components/colaborador/ColaboradorVenderModal.tsx` — refactor completo do JSX e cores, adicionar resumo sticky, atalhos, tela de sucesso
- `src/components/colaborador/ColaboradorVenderTab.tsx` — repaint dos cards/KPIs/CTA
- `src/components/colaborador/ColaboradorRelatoriosTab.tsx` — repaint dos cards/listas/badges

## Detalhes técnicos

- Cores aplicadas via classes Tailwind diretas (`bg-white`, `bg-emerald-50`, `text-emerald-700`, `border-slate-200`) — exceção pontual ao design system porque essas duas abas terão visual próprio claro, sem afetar o resto do app (que segue dark).
- Sem mudanças em hooks, edge functions ou banco.
- Mantém comportamento atual de inventário e validação.
