## Reformulação Premium — Página "Sou Produtor"

Vamos transformar a página `/area-do-produtor` em uma experiência mais premium, focada em comunicar com força a proposta de valor para produtores e exibir o catálogo completo de soluções da FestPag.

---

### 1. Novo Hero (substitui o atual com logo + tag)

Remover:
- Imagem da logo FestPag no topo
- Badge "Para Produtores de Eventos"

Adicionar uma headline no mesmo estilo da home — uppercase, extrabold, com palavras destacadas em gradient e na fonte manuscrita Caveat — mas com mensagem voltada ao produtor:

> **VENDA, GERENCIE E FAÇA A SUA**  
> **FESTA ACONTECER COM A**  
> *plataforma completa* (Caveat verde)  
> **PARA PRODUTORES**

Subtítulo curto reforçando: "Cadastre eventos, controle vendas em tempo real, valide ingressos no QR Code e opere a portaria — tudo em um só lugar."

CTAs mantidos:
- **Começar agora** (variant hero) → `/area-do-produtor/cadastro`
- **Já tenho conta** (outline) → `/area-do-produtor/login`

Preserva o mesmo glow radial + gradiente de fundo já existente.

---

### 2. Nova seção "Nossas Soluções" — Bento Grid Premium

Substitui a atual seção `ProducerSolutionsSection variant="page"` (que é compartilhada com a home) por uma seção **dedicada e exclusiva** da página do produtor, exibindo as 17 soluções solicitadas.

Estrutura visual (Bento Grid premium, asymmetric):

```text
┌────────────────────────────┬──────────────┬──────────────┐
│                            │              │              │
│   CARD HERO (2x2)          │  Cadastro de │  Gestão de   │
│   "A plataforma            │  Eventos     │  Lotes       │
│    completa para           │              │              │
│    produzir e vender"      ├──────────────┼──────────────┤
│   + métricas / stats       │  Site        │  Eventos     │
│   + CTA principal          │  Exclusivo   │  Convidados  │
│                            │              │              │
└────────────────────────────┴──────────────┴──────────────┘
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Eventos      │ Pré-venda    │ Ingresso     │ Cupom de     │
│ Gratuitos    │ Restrita     │ Nominal      │ Desconto     │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Validação    │ Dashboard    │ Controle     │ Ingresso     │
│ de Ingressos │              │ de Vendas    │ Digital      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Área do      │ Gestão de    │ Área do      │ Check-in com │
│ Produtor     │ Produtores   │ Colaborador  │ QR Code      │
├──────────────┴──────────────┴──────────────┼──────────────┤
│  Listas de Convidados (card destaque 3-col)│   (vazio)    │
└────────────────────────────────────────────┴──────────────┘
```

Cada card pequeno terá:
- Ícone com fundo gradient (primary→accent) num quadrado arredondado
- Título em uppercase, font-display
- Descrição curta de 1 linha
- Hover: borda primary, glow sutil, ícone com leve scale

Card hero (top-left, 2x2):
- Fundo gradient escuro com glow + globo decorativo (mesmo estilo do bento atual)
- Headline forte
- 3 mini-stats inline (ex.: "Pix instantâneo", "Taxa transparente", "Suporte dedicado")
- CTA "Começar agora"

Mapeamento de ícones (lucide-react):
| Solução | Ícone |
|---|---|
| Cadastro de Eventos | `CalendarPlus` |
| Gestão de Lotes | `Layers` |
| Site Exclusivo (mobile) | `Smartphone` |
| Eventos para Convidados | `UserCheck` |
| Eventos Gratuitos | `Gift` |
| Pré-venda Restrita | `Lock` |
| Ingresso Nominal | `IdCard` |
| Cupom de Desconto | `Tag` |
| Validação de Ingressos | `ShieldCheck` |
| Dashboard | `LayoutDashboard` |
| Controle de Vendas | `TrendingUp` |
| Ingresso Digital | `Ticket` |
| Área do Produtor | `Briefcase` |
| Gestão de Produtores | `Users` |
| Área do Colaborador | `UserCog` |
| Check-in com QR Code | `QrCode` |
| Listas de Convidados | `ClipboardList` |

---

### 3. Manutenção das demais seções

- **Como funciona (3 passos)**: mantida como está — já está alinhada visualmente.
- **CTA final**: mantido — funciona bem como fechamento.
- **Recursos (bento de 6 features)**: **removido** — vira redundante com a nova seção de 17 soluções.

---

### Arquivos a modificar/criar

- `src/components/home/ProducerSolutionsBento.tsx` *(novo)* — bento grid das 17 soluções, exclusivo da página do produtor.
- `src/pages/AreaDoProdutor.tsx` — refatorar hero (sem logo/badge, nova headline estilo home) e substituir a seção antiga de soluções pelo novo bento. Remover seção "Recursos" (6 features).

Nenhum impacto em rotas, dados ou outras telas. A `ProducerSolutionsSection` original continua intacta para uso na home.
