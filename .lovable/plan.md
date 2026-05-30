## Plan: Checklist operacional FestPag (admin-only)

Adicionar um mapa de processo de eventos como ferramenta interna do admin. Dados hardcoded; sem Supabase nesta etapa.

### 1. Novo componente — `src/components/admin/ProcessoEventoFestPag.tsx`

- React + TS + Tailwind, lucide-react (sem libs novas).
- Container `max-w-[680px]` centralizado, light mode.
- Tipos `Owner`, `Task`, `Phase` e array `phases` exatamente como na spec (7 fases, conteúdo literal — não reescrever copy).
- Mapa de ícones lucide via objeto `{ Handshake, ClipboardList, Settings, MapPin, Truck, Users, PartyPopper, Check, ChevronDown, Zap }` para resolver `phase.icon` por string.
- Estado em memória:
  - `done: Set<string>` com chave `${phaseId}:${taskIdx}` — toggle ao clicar no card.
  - `openPhases: Record<number, boolean>` — todas começam `true`.
- UI:
  - Topo: legenda (FestPag azul / Cliente âmbar / Ambos cinza / Bloqueador vermelho) + barra de progresso (trilho `#E8E6DF`, fill `#3B6D11`) + texto "X de Y tarefas concluídas · NN%".
  - Cada fase: header clicável com badge colorida (HEX da paleta), ícone da fase, título peso 500, meta, contador `n/total`, chevron rotacionado 180° quando aberto.
  - Corpo: cards de tarefa (`bg-#F7F6F2`, border `#E8E6DF`, radius 8px) com checkbox redondo à esquerda (verde `#EAF3DE`/`#3B6D11` quando done), título (riscado + opacidade reduzida quando done), sub, e linha de badges: responsável (fp/cli/amb com HEX da spec), `Bloqueador` (`#FCEBEB`/`#A32D2D` + ícone Zap) se `blocker`, `dep` (cinza tracejado) se houver.
- Cores aplicadas via `style={{ backgroundColor, color, borderColor }}` (HEX literais da spec — exceção explícita à regra de tokens, pois a spec exige HEX validados).
- Tipografia: títulos `font-medium`, corpo `font-normal`, sem `font-bold` no meio de frase.

### 2. Nova rota — `src/App.tsx`

- Adicionar `/admin/checklist` junto das outras rotas `/admin/*`, protegida pelo **mesmo `AdminProtectedRoute` já usado** (ex.: `/admin/configuracoes`) e envolto em `AdminLayout` com `title="Checklist"` (mesmo padrão de `AdminSaude`).
- Nova página fina `src/pages/admin/AdminChecklist.tsx` que renderiza `<AdminLayout title="Checklist"><ProcessoEventoFestPag /></AdminLayout>`.

### 3. Item de menu — `src/components/admin/AdminSidebar.tsx`

- Adicionar entrada em `menuItems` entre `Repasses` e `Saúde` (ou antes de `Configurações`, mas fora dela — confirmado: `Configurações` é para taxas/convites):
  ```ts
  { title: 'Checklist', url: '/admin/checklist', icon: ClipboardCheck }
  ```
- Importar `ClipboardCheck` do `lucide-react`. Mesmo `NavLink`, mesmas classes laranja já usadas pelos outros itens — zero divergência de estilo.

### Fora de escopo

- Sem Supabase, sem edge function, sem persistência, sem multi-evento.
- Sem dark mode nesta versão.
- Sem alterações em outras telas admin, em rotas de produtor/cliente, ou em guards.

### Validação

- `tsc --noEmit` limpo.
- Screenshot de `/admin/checklist` com o item "Checklist" ativo no sidebar e o accordion renderizado.
- Reporta arquivo:linha das 3 mudanças (sidebar, rota, página).
