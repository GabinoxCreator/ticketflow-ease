## Contexto

A tela atual de login do colaborador (`/colaborador`) está com card escuro sobre fundo claro, criando contraste estranho e visual datado. Como é uma área interna (portaria/operação), o login deve ser **simples, claro e direto** — sem textos extras, sem badge decorativo grande, sem hierarquia pesada.

## Objetivo

Login limpo, em tons claros, alinhado ao padrão moderno do FestPag, otimizado para uso rápido em mobile (390px).

## Arquivo único alterado

- `src/pages/colaborador/ColaboradorLogin.tsx`

Nada mais é tocado (sem mexer em auth logic, contexto, ou outras telas do colaborador).

## Direção visual

**Paleta clara:**
- Fundo da página: `bg-white` com sutil gradient `from-white via-slate-50 to-indigo-50/40`
- Card: `bg-white` com `border border-slate-200/80` e `shadow-xl shadow-indigo-500/5` (sombra colorida discreta para dar premium feel)
- Inputs: `bg-slate-50` borda `border-slate-200`, focus ring primary
- Texto: `text-slate-900` títulos, `text-slate-500` auxiliar

**Sem dark card:** o card fica claro mesmo em dark mode (forçar `bg-white text-slate-900`) — é uma tela operacional de uso em ambientes claros (portaria, ingresso).

## Estrutura proposta (minimalista)

```text
┌─────────────────────────────────┐
│                                 │
│         [logo festpag]          │  ← logo h-10
│      Acesso do colaborador      │  ← text-sm slate-500
│                                 │
│   ┌───────────────────────┐     │
│   │  Usuário              │     │
│   │  [ portaria01      ]  │     │
│   │                       │     │
│   │  Senha                │     │
│   │  [ ••••••••     👁  ] │     │
│   │                       │     │
│   │  [    Entrar    →   ] │     │  ← botão primary h-12
│   └───────────────────────┘     │
│                                 │
│   Problemas? Fale com o produtor│  ← text-xs muted
│                                 │
└─────────────────────────────────┘
```

## Mudanças concretas

1. **Remover** o badge "Área do Colaborador" grande com ícone shield (informação redundante).
2. **Remover** o título "Entrar para operar" + descrição longa do CardHeader. Substituir por uma linha sutil acima do card: `Acesso do colaborador` (text-sm, slate-500), abaixo do logo.
3. **Card claro** com padding generoso (`p-6 sm:p-7`), bordas arredondadas `rounded-2xl`, sem CardHeader/CardTitle pesados.
4. **Labels** menores (`text-xs font-semibold uppercase tracking-wide text-slate-600`) acima de cada input — estilo moderno.
5. **Inputs** altos (`h-12`), fundo `bg-slate-50/70`, borda neutra, focus com ring primary fino.
6. **Botão Entrar:** h-12, gradient sutil `from-primary to-indigo-600`, ícone seta direita, texto bold.
7. **Erro:** alert inline mais discreto — fundo `bg-red-50`, borda `border-red-200`, ícone `AlertCircle` pequeno.
8. **Footer:** linha única `text-xs text-slate-400` — "Problemas para acessar? Fale com o produtor do evento."
9. **Loading:** ao enviar, botão mostra spinner + "Validando…" (mais profissional que "Entrando...").

## Microcopy enxuto

- Logo + subtítulo: `Acesso do colaborador`
- Label usuário: `Usuário`
- Placeholder usuário: `seu_usuario`
- Label senha: `Senha`
- Placeholder senha: `••••••••`
- Botão: `Entrar`
- Footer: `Problemas para acessar? Fale com o produtor do evento.`

## Detalhes técnicos

- Manter estrutura React igual (mesmo `useColaboradorAuth().login`, mesmo redirect).
- Usar tokens semânticos `text-primary`, `bg-primary`, mas para o fundo claro forçar `bg-white` e neutros `slate-*` (essa tela é especificamente clara, não segue dark theme).
- `motion.div` mantido para fade-in suave.
- Garantir responsivo em 390px: max-w-sm, padding lateral adequado.
- Acessibilidade: labels com `htmlFor`, autoComplete preservado, `aria-label` no toggle de senha.

## Fora de escopo

- Lógica de autenticação
- Outras telas do colaborador (eventos, evento, scanner) — já foram refinadas anteriormente
- Backend, RLS, edge functions
- Tema global do app (alteração só nesta página)

## Checklist de validação

1. Tela com fundo branco/claro suave, sem áreas escuras
2. Logo FestPag centralizado no topo com subtítulo discreto
3. Card claro, sombra suave, bordas arredondadas
4. Apenas 2 campos: Usuário e Senha
5. Botão Entrar grande (h-12) destacado em roxo
6. Toggle de senha funciona (olho)
7. Erro aparece em alert claro acima dos campos
8. Footer com 1 linha discreta
9. Em 390px nada estoura, tudo respira
10. Visual coerente com o padrão moderno do FestPag
