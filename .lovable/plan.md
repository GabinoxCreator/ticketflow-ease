

# Ajustar card de ingresso para usar proporção padrão de banner

## Resumo
Os cards na página `/meus-ingressos` mostram a imagem com barras laterais sobrando porque o banner está em layout horizontal com `object-contain`. Vou refatorar para layout **vertical** (banner em cima, info embaixo), usando a **mesma proporção dos banners de evento do site (`aspect-[16/10]`)**, com `object-cover` para preencher sem barras.

## Mudanças

### `src/pages/MeusIngressos.tsx` — `TicketCardSimple`

**Layout atual (problema):**
- Mobile: imagem em cima `h-32` com `object-contain` → barras laterais
- Desktop: imagem na lateral esquerda `sm:w-56` com `object-contain` → barras laterais e imagem pequena

**Novo layout (uniforme mobile + desktop):**
- Banner full-width no topo do card com `aspect-[16/10]` (mesma proporção do `EventCard` da home)
- `object-cover` para preencher todo o espaço sem barras laterais (imagens fora da proporção são levemente cortadas, sempre mantendo a área central visível)
- Fallback `bg-muted/40` para quando a imagem não carregar
- Gradiente sutil na base do banner para transição suave para o conteúdo
- Badge de status (Válido/Utilizado/Cancelado) sobreposto no canto superior direito do banner com `backdrop-blur`
- Bloco de informações (título, lote, data, hora, local, código QR e botões PDF/Usar Ingresso) em coluna abaixo do banner

```text
┌────────────────────────────────────┐
│                                    │
│       BANNER 16:10 (cover)    [✓]  │  ← badge sobreposto
│                                    │
├────────────────────────────────────┤
│  Samba do Brasileiro               │
│  Primeiro Lote                     │
│  📅 11 abr   🕐 18:00              │
│  📍 Made in Brazil Bar - Rio Preto │
│  ──────────────────────────────    │
│  🔲 51B63BFE   [PDF] [Usar]        │
└────────────────────────────────────┘
```

### Detalhes
- Aplica-se a todas as três abas (Próximos, Anteriores, Cancelados) automaticamente, pois o componente `TicketCardSimple` é compartilhado
- Badge de status migra do header da info para sobreposto no banner (libera espaço e fica mais visível)
- Skeletons (`TicketSkeleton`) também ajustados para o novo formato vertical
- Modal premium do "Usar Ingresso" permanece igual ao já implementado

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| `src/pages/MeusIngressos.tsx` | Refatorar `TicketCardSimple` e `TicketSkeleton` para layout vertical com banner em `aspect-[16/10]` `object-cover` |

