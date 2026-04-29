# Ajustes na página do evento

Apenas duas mudanças pontuais sobre o que já existe — sem refazer os cards de ingressos.

## 1. Manter os cards de ingressos como estão

O estilo atual (header roxo com nome do setor "ÁREA VIP / INGRESSOS", badge "1 opção" no canto, e stepper circular `−  0  +`) fica **inalterado**.

Isso significa que do plano premium anterior **NÃO** entram:
- Redesenho do `LotCard` / stepper
- Mudança no agrupamento por setor
- Bordas/gradientes novos nos containers de lote

## 2. Cor do nome do local (venue) → branco

No arquivo `src/pages/EventDetails.tsx`, o `event.venue` ("Made in Brazil Bar") aparece em duas posições com `text-primary` (roxo):

- **Hero desktop** (~linha 215):
  ```tsx
  <p className="text-primary font-semibold text-xl break-words">
  ```
  → trocar para `text-foreground` (branco).

- **Bloco mobile de info do evento** (~linha 282):
  ```tsx
  <p className="text-primary font-semibold text-lg mb-4 break-words">
  ```
  → trocar para `text-foreground` (branco).

Mantém `font-semibold` e o tamanho de cada contexto.

## O que continua do polish premium aprovado antes

Apenas as melhorias de moldura ao redor (que não tocam nos cards de ingresso):
- Glows decorativos indigo/magenta no hero
- Sidebar desktop com visual glass + trust strip
- Bottom bar mobile com `backdrop-blur` + safe-area

## Arquivo modificado

- `src/pages/EventDetails.tsx`
