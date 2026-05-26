## Reorganizar card do ingresso (aba Check-in)

No `ColaboradorQRTab.tsx`, redesenhar a hierarquia visual de cada card da lista, dando respiro entre os elementos e peso visual correto.

### Nova hierarquia (top → bottom)

1. **Badge "Aguardando"** no topo, alinhada à esquerda, com `mb-2` separando do conteúdo.
2. **Nome do cliente** (`holder_name`) — `text-base font-semibold text-slate-900`, elemento de maior peso, `truncate`.
3. **Email** (`holder_email`) — `text-sm text-slate-600 truncate`, logo abaixo do nome.
   - Se `holder_name === holder_email` (caso comum quando o pedido não capturou o nome), oculta esta linha para não duplicar.
4. **Metadados do ingresso** — `text-[11px] uppercase tracking-wider text-slate-400 font-mono mt-1.5`, formato `LOTE AMIGO · 32EF1A02`.

### Layout do card

- Padding `p-4` (era `p-3`) com `gap-4` entre coluna de texto e botão.
- Coluna de texto: `flex-1 min-w-0`.
- Botão Check-in: alinhado verticalmente ao centro (`self-center`), tamanho atual mantido.
- Estado `used`: mantém `bg-slate-50 opacity-70` já implementado.

### Arquivos

- `src/components/colaborador/ColaboradorQRTab.tsx` — somente o bloco do card dentro do `.map`. Sem mudanças de lógica.
