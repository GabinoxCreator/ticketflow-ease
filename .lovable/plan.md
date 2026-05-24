## Ajustes no modal de check-in da lista

**Arquivo:** `src/components/colaborador/ColaboradorListaDetalhe.tsx`

### 1. Modal claro (independente do tema global)
- `DialogContent`: `bg-white text-slate-900 border-slate-200`
- Título: `text-slate-900`
- Textos secundários: `text-slate-500` / `text-slate-600`
- Card com nome do convidado: `bg-slate-50 border-slate-200`, ícone com `bg-indigo-50 text-indigo-600`
- Botão "Fechar": `border-slate-200 text-slate-700 hover:bg-slate-50`
- Botão "Confirmar check-in": mantém verde de sucesso

### 2. Aviso mais sutil
Substituir o bloco amber atual por uma linha discreta acima da lista:
> "Clique no nome, confira os dados e toque em Confirmar check-in."

Estilo: `bg-amber-50/60 border border-amber-100 text-amber-800 text-xs p-2.5 rounded-md`, ícone pequeno (`w-4 h-4`).

### 3. Sem mudanças de lógica
Busca, listagem, chamada à edge function `collaborator-validate-guest-entry`, schema e demais abas (QR, Vender, Relatórios) permanecem iguais.
