

# PDF do Ingresso — versão completa e didática

## Resumo
O PDF atual é minimalista e gerado por screenshot (`html2canvas`), com qualidade ruim e poucas informações. Vou refazer o PDF gerando-o **nativamente via `jsPDF`** (texto vetorial, alta qualidade, peso menor), com layout de **ingresso digital completo**, todas as informações relevantes, branding FestPag e nome de arquivo amigável.

## Como vai ficar o PDF

```text
┌─────────────────────────────────────────────────────┐
│  ░░░ HEADER colorido (gradiente FestPag) ░░░        │
│   FESTPAG                              INGRESSO     │
│   Plataforma de eventos              DIGITAL ✓Válido│
├─────────────────────────────────────────────────────┤
│   SAMBA DO BRASILEIRO                               │
│   2º Lote                                           │
│                                                     │
│   ┌─────────────┐   📅 Data e Horário               │
│   │             │   sexta, 18 de abril de 2026      │
│   │   QR CODE   │   18:00                           │
│   │             │                                   │
│   └─────────────┘   📍 Local                        │
│   3241BBC3         Made in Brazil Bar               │
│   Código          Rio Preto/SP                      │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│   👤 DADOS DO PORTADOR                              │
│   Nome / E-mail / Telefone                          │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│   💳 INFORMAÇÕES DA COMPRA                          │
│   Lote · Valor pago · Data da compra                │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│   ℹ️  COMO USAR SEU INGRESSO                         │
│   1. Apresente o QR Code na entrada                 │
│   2. Tenha documento com foto                       │
│   3. Pessoal e intransferível                       │
│   4. Chegue com antecedência                        │
│   ⚠️ Não compartilhe a imagem · 1 entrada por code  │
├─────────────────────────────────────────────────────┤
│  Gerado por FestPag · ingressosrp.com.br · 24/04    │
└─────────────────────────────────────────────────────┘
```

Estados visuais por status: header fica **verde** (Válido), **vermelho** (Utilizado, com selo "UTILIZADO" sobre o QR) ou **cinza** (Cancelado, com selo "CANCELADO").

## Mudanças técnicas

### 1. `src/hooks/useUserTickets.ts`
- Adicionar campos ao select: `unit_price` (se existir na tabela `tickets`) — uso `lot.price` como fallback.
- Atualizar a interface `UserTicket`.

### 2. `src/pages/MeusIngressos.tsx` — `handleDownloadPDF`

Trocar a abordagem `html2canvas` (screenshot) por **geração nativa em jsPDF**:
- Página A4, margens 15mm
- Header com retângulo colorido (cor por status), logo "FESTPAG" + badge "INGRESSO DIGITAL"
- Título do evento grande, lote como subtítulo
- QR Code: gerar com a lib `qrcode` (data URL PNG nítido, escaneável) e `pdf.addImage()`
- Blocos de informação separados por linhas tracejadas estilo ticket
- Seções: Data/Local, Portador, Compra, Como usar, Importante
- Footer com créditos FestPag e timestamp de emissão

### 3. Nome do arquivo
**Atual:** `ingresso-3241bbc3.pdf`
**Novo:** `Ingresso-FestPag-{evento-slug}-{CODIGO}.pdf`
Ex.: `Ingresso-FestPag-Samba-do-Brasileiro-3241BBC3.pdf`

Slugify: minúsculas, espaços → hífens, remove acentos, limita 40 chars.

### 4. Limpeza
- Remover o `<div ref={ticketRef}>` oculto (não é mais necessário)
- Remover dependência de `html2canvas` se não for usada em outro lugar

### 5. Dependências
- `qrcode` + `@types/qrcode` (novo, ~50kb, leve)
- `jspdf` (já instalado)

## QA obrigatório
Após implementar, vou gerar um PDF de exemplo via script Node, converter páginas em imagem com `pdftoppm` e inspecionar visualmente: sem texto sobreposto, QR escaneável, margens corretas, branding consistente. Vou listar problemas e fixes antes de entregar.

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| `src/hooks/useUserTickets.ts` | Adicionar `unit_price` no select e na interface |
| `src/pages/MeusIngressos.tsx` | Reescrever `handleDownloadPDF` com jsPDF nativo + nome amigável; remover div oculto |
| `package.json` | Instalar `qrcode` e `@types/qrcode`; remover `html2canvas` se não usado |

