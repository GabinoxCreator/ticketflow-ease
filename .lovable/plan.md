# Ajustes no `ticketPdfTemplate.ts` para bater com o exemplo

Comparando o PDF de exemplo (`ingresso_festpag_redesign-2.pdf`) com o que está saindo hoje (foto 2), o layout estrutural está correto — logo, tagline, título, badge gradiente, QR com moldura, grid 2×2, card de orientações, footer. As diferenças são pontuais, todas em `src/utils/ticketPdfTemplate.ts`.

## Diferenças identificadas

| Item | Hoje (foto 2) | Exemplo (alvo) |
|---|---|---|
| Código do ingresso | UUID inteiro `638df2fd-e820-4...` espalhado pela página inteira | `5D6B9746` — 8 caracteres em maiúsculo, centralizado e compacto |
| Data | `Sex, 06/06/2026` (curto) | `Sábado, 25 de julho de 2026` (longo, Title-Case) |
| Hora abaixo da data | `Às 13:00` | `às 13:00` (minúsculo) |
| Horário emitido | `Às 13:12` | `às 13:12` (minúsculo) |
| Badge de lote | `1º LOTE` | `LOTE AMIGO` — usar `data.lot.name` em UPPERCASE direto, sem prefixos |

A foto 1 (Acrobat) também confirma que o exemplo mostra `INGRESSO DIGITAL`, título grande, badge gradiente arredondado, QR grande, código curto e grid — tudo presente no nosso template; só os 4 ajustes acima.

## Mudanças

Arquivo único: `src/utils/ticketPdfTemplate.ts`

1. **Código curto** (bloco "TICKET CODE", linhas ~277–295):
   - Substituir o `fullCode` espaçado por `data.ticket.ticket_code.replace(/-/g, '').slice(0, 8).toUpperCase()` espaçado com `'  '`.
   - Manter font Courier bold, tamanho fixo 17 (não precisa mais do auto-shrink, já é curto).
   - O auto-fit loop pode ser removido.

2. **Data longa** (bloco "INFO GRID", linhas ~309–319):
   - Trocar `format(eventDate, "EEE, dd/MM/yyyy", { locale: ptBR })` por `format(eventDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })` mantendo o `toTitleCase` para a primeira letra do dia.
   - `v2` da célula DATA E HORÁRIO: trocar `Às ${timeStr}` por `às ${timeStr}`.
   - `v2` da célula EMITIDO EM: trocar `Às ${issuedTime}` por `às ${issuedTime}`.

3. **Badge sem prefixo** (linha 232): já é `data.lot.name.toUpperCase()` — verificar se vem como `"1º Lote"`. Se vier, o badge mostrará `1º LOTE`, que difere do exemplo (`LOTE AMIGO`). Isso depende do dado de entrada, não do template. **Sem mudança no template**; é fiel ao nome cadastrado do lote.

## Validação

- Gerar PDF de cortesia → confirmar código com 8 chars maiúsculos, data longa "Sábado, 25 de julho de 2026", horários em "às".
- Confirmar que o QR continua ~70mm e legível.
- Confirmar que o resto do layout (logo, badge, grid, orientações, footer) não mexeu.

Pronto para implementar quando aprovar.
