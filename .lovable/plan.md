

# Melhorias na página "Meus Ingressos"

## Resumo
Dois ajustes na página `/meus-ingressos`:
1. **Banner do card**: aumentar a largura lateralmente para mostrar a imagem completa do evento, mantendo a altura.
2. **Modal de abertura do ingresso**: redesenhar com visual premium estilo "ticket digital", aplicado nas três abas (Próximos, Anteriores, Cancelados), com **estado visual claro** indicando se está válido, utilizado ou cancelado.

## Mudanças

### 1. Banner do card — `TicketCardSimple`

**Atual:** `sm:w-40` + `object-cover` → imagem cortada e quadradinha.

**Novo:**
- Largura lateral no desktop: `sm:w-40` → `sm:w-56` (224px)
- `object-cover` → `object-contain` com fundo `bg-muted/40` para mostrar a imagem completa
- Altura mantida (mobile `h-32`, desktop preenche o card)
- Restante do card (info, botões, código) intacto

### 2. Botão para abrir o ingresso em todas as abas

Hoje o botão só aparece quando `status === 'valid'`. Mudança:
- **Próximos (valid)** → botão **"Usar Ingresso"** (verde/gradient) + "PDF"
- **Anteriores (used)** → botão **"Ver Ingresso"** (cinza)
- **Cancelados (cancelled)** → botão **"Ver Detalhes"** (cinza com borda destrutiva)

Todos abrem o **mesmo modal**, que se adapta ao status.

### 3. Redesign do Modal — com estado visual por status

```text
┌────────────────────────────────────┐
│  ░░░ banner do evento (blur) ░░░   │  ← hero: banner desfocado
│         [ícone do status]          │     muda de cor por status
│         SEU INGRESSO               │
├────────────────────────────────────┤
│  ╭──────────────────────────────╮  │
│  │   ▓▓▓ QR CODE 220px ▓▓▓      │  │  ← card branco
│  │   [overlay se used/cancel]   │  │
│  │   CÓDIGO: 51B63BFE           │  │
│  │   Nome do titular            │  │
│  ╰──────────────────────────────╯  │
│  ◐ - - - - - - - - - - - - - - ◑  │  ← perfuração estilo ticket
│   📅 11 de abril  🕐 18:00          │
│   📍 Made in Brazil Bar             │
│   🎫 Primeiro Lote                  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ ✓ INGRESSO VÁLIDO            │  │  ← banner de status na base
│  └──────────────────────────────┘  │     (cor muda por estado)
│                                    │
│   [Baixar PDF]  [Compartilhar]     │
└────────────────────────────────────┘
```

#### Estados visuais (essência do pedido)

| Status | Cor dominante | Ícone hero | Overlay no QR | Banner de status |
|---|---|---|---|---|
| **valid** (Próximos) | Verde (`from-green-500 to-emerald-600`) | `CheckCircle2` | nenhum (QR limpo, escaneável) | "✓ INGRESSO VÁLIDO — Apresente na entrada" |
| **used** (Anteriores) | Vermelho/escuro (`from-red-600 to-rose-700`) | `XCircle` | Selo diagonal grande **"UTILIZADO"** semi-transparente sobre o QR + QR esmaecido (`opacity-40 grayscale`) | "✕ INGRESSO JÁ UTILIZADO — Validado em [data]" |
| **cancelled** | Vermelho/cinza (`from-zinc-700 to-red-900`) | `Ban` | Selo diagonal **"CANCELADO"** + QR esmaecido | "⊘ INGRESSO CANCELADO" |

Detalhes:
- O **hero do modal** muda totalmente de cor conforme o status — fica imediatamente óbvio o estado ao abrir
- O **banner do evento desfocado** continua de fundo do hero, mas o gradiente colorido por cima reflete o status
- **Selo diagonal** sobre o QR usa `rotate(-15deg)`, fonte bold grande, com borda dupla — visual de carimbo
- QR de ingressos `used`/`cancelled` recebe `opacity-40 grayscale` (não-funcional visualmente, evita confusão na portaria)
- **Animação**: entrada com fade + slide-up; selo de status entra com pequeno zoom (`framer-motion`)
- **Ações**:
  - `valid`: "Baixar PDF" + "Compartilhar" (Web Share API com fallback de copiar)
  - `used`/`cancelled`: apenas "Baixar PDF" (registro/comprovante)
- Acessibilidade: `Dialog` shadcn já entrega ARIA + ESC

### 4. Detalhes técnicos

- Arquivo único alterado: `src/pages/MeusIngressos.tsx`
- Sem novas dependências (`qrcode.react`, `framer-motion`, `html2canvas`, `jspdf`, `lucide-react` já existem)
- "Perfuração" do ticket: dois `div` absolutos `rounded-full bg-background` nas laterais + `border-dashed` horizontal
- Mapa de status centralizado em uma constante (cores, ícones, labels, copy do banner) para manter consistência
- Sem mudanças em `useUserTickets`, schema ou banco

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| `src/pages/MeusIngressos.tsx` | Banner mais largo + botão em todas as abas + modal redesenhado com estados visuais por status |

