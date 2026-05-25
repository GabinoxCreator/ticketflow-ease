# Redesign do PDF do Ingresso

## Resumo

Substituir o layout dos dois geradores de PDF (`manualSaleTicketsPdf.ts` e `ticketPdf.ts`) pelo novo design — QR grande (~78mm), logo FestPag, badge de lote com gradiente, código monoespaçado, grid de info, card de orientações e footer discreto. Unificar tudo num template compartilhado para evitar drift.

## Arquivos

**Novo:**
- `src/utils/ticketPdfTemplate.ts` — função base `renderTicketPage(pdf, data)` com todo o desenho. Recebe dados normalizados (event, lot, ticket, holder, issuedAt, status opcional).

**Editados:**
- `src/utils/manualSaleTicketsPdf.ts` — vira shim fino que normaliza `SimpleTicketForPdf/Event` e delega ao template. Mantém assinatura pública `generateManualSaleTicketsPDF(tickets, event)`.
- `src/utils/ticketPdf.ts` — vira shim fino que normaliza `UserTicket` e delega ao template. Mantém `generateTicketPDF(ticket)`. Stamp `UTILIZADO`/`CANCELADO` sobre o QR é preservado (passado como flag opcional ao template).

**Inalterados:** call sites em `SuccessScreen.tsx`, `CourtesyTicketsButton.tsx`, `MeusIngressos.tsx`.

## Implementação do template

Construído com **jsPDF puro** (não html2canvas — a stack atual já é jsPDF e está estável). O HTML enviado serve como referência visual; cada bloco é traduzido para `pdf.rect/text/addImage`.

**Ordem de desenho por página A4** (margens 12/14/8/14 mm):

1. **Logo** — `addImage` de `src/assets/logo-festpag.png`, largura 44mm, centralizado. Pré-carrega 1x e cacheia em variável de módulo.
2. **Tagline** "INGRESSO DIGITAL" — 7.5pt, letter-spacing simulado, cor `#8a8a8a`.
3. **Linha sutil** `#ececec` separando header.
4. **Nome do evento** — 20pt, cor `#2D1B69`, `drawBold`, `splitTextToSize` para wrap.
5. **Badge do lote** — pill arredondado com gradiente (~60 faixas verticais interpolando `#4D7CFF → #9B5BFF → #FF5BC8`), texto branco 9.5pt.
6. **QR Code** — 78mm × 78mm centralizado, frame branco com borda `#ececec`. `errorCorrectionLevel: 'H'`, `width: 600`.
7. **Stamp opcional** — se `status` for `used`/`cancelled`, overlay translúcido sobre o QR com o label.
8. **Código do ingresso** — `ticket_code` completo, monoespaçado (`courier`), 17pt, espaçado char-a-char para simular letter-spacing 5px. Label "CÓDIGO DO INGRESSO" 7pt abaixo.
9. **Info grid 2×2** em card `#fafafa` arredondado — Data/Horário · Local · Portador · Emitido em.
10. **Card de orientações** — `roundedRect` com borda tracejada `#d0c8e8`, fundo `#faf7ff`. Título 8.5pt `#6B3FCF`. 4 bullets fixos (círculos lilás 1.6mm).
11. **Footer** — linha `#ececec`, "FestPag · festpag.com.br" à esquerda e "Plataforma de eventos" à direita.

Quebra de página: `pdf.addPage()` entre ingressos (padrão já existente).

## Decisões

- **Sem `INGRESSO DIGITAL · VENDA MANUAL`** em lugar nenhum — substituído pela tagline neutra "INGRESSO DIGITAL". PDF unificado para online, manual e cortesia.
- **Stamp UTILIZADO/CANCELADO** preservado em `ticketPdf.ts` (Meus Ingressos). Cortesia e venda manual sempre sem stamp.
- **Logo:** usa `src/assets/logo-festpag.png` (já existe), convertido para base64 via `fetch + FileReader` e cacheado.
- **Código completo** em vez do `slice(0, 8)` atual — UUID quebra em 2 linhas se necessário.
- **Gradiente:** simulado por faixas verticais (técnica padrão jsPDF).

## Validação

- Gerar cortesia (1, 3, 5 ingressos) — confirmar 1 página por ingresso.
- Gerar via "Meus Ingressos" (valid, used, cancelled) — confirmar stamp só nos dois últimos.
- Nome de evento de 60+ chars — confirmar wrap sem quebrar grid.
- QR lido com app padrão de celular, da tela e impresso.