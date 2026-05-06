## Reformular página de Configurações do Produtor

Arquivo: `src/pages/ProducerSettings.tsx`

### Estrutura visual nova

Layout em 2 colunas no desktop, 1 coluna no mobile, com hero/header próprio da página:

```text
┌──────────────────────────────────────────────────┐
│ Configurações                                    │
│ Gerencie seu perfil e os dados da sua produtora  │
└──────────────────────────────────────────────────┘

┌────────────────────────┐  ┌────────────────────────┐
│ 👤 Dados Pessoais      │  │ 🏢 Produtora           │
│ (read-mostly do perfil)│  │ (reflete no evento)    │
│ - Email (disabled)     │  │ - Nome da Produtora ⭐  │
│ - Nome completo        │  │   (badge "aparece em   │
│ - WhatsApp             │  │    Realização")        │
│                        │  │ - Logo da produtora    │
│ [Salvar Perfil]        │  │   (upload futuro/      │
│                        │  │    fallback FestPag)   │
│                        │  │ - Razão social         │
│                        │  │ - CNPJ/CPF             │
│                        │  │ - Email organização    │
│                        │  │ - Telefone             │
│                        │  │ [Salvar Produtora]     │
└────────────────────────┘  └────────────────────────┘
```

### Mudanças de design

- Header da página com gradiente sutil (Indigo → Magenta) e ícone, igual estilo do dashboard.
- Cards com `rounded-2xl`, borda suave, padding maior, ícone colorido em chip.
- Campos com labels mais claras + helper text curto em cinza (ex.: "Este nome aparece como Realização na página pública do evento").
- Badge/realce no campo "Nome da Produtora" indicando que é o nome público.
- Preview ao vivo do bloco "Realização" (avatar + nome) abaixo do campo, mostrando exatamente como vai aparecer no site do evento.
- Botões `size="lg"`, full-width no mobile, alinhados à direita no desktop.
- Estados de loading/saved consistentes (toast + botão desabilitado).

### Renomear / reorganizar (sem mudar schema)

- O label "Nome da Marca / Organização" passa a ser **"Nome da Produtora"** (continua salvando em `brand_name`).
- Seção "Dados da Organização" passa a se chamar **"Produtora"** para alinhar com a linguagem do site.
- Campos secundários (Razão Social, CNPJ, Email/Telefone da org) ficam num grupo "Dados fiscais e de contato" colapsável ou abaixo, com menos destaque que o nome da produtora.

### Sincronização com a página do evento

Sem mudanças: a página `EventDetails.tsx` já lê `producer_profiles.brand_name` e `logo_url` via join (feito no passo anterior). Após salvar aqui, o "Realização" reflete automaticamente.

### Sem mudanças

- Nenhuma alteração de schema, RLS ou tipos.
- Nenhuma mudança em outras páginas (a página do evento já está integrada).
- Upload de logo NÃO entra agora — fica como melhoria futura. O fallback continua sendo a logo do FestPag.

### Arquivos afetados

- `src/pages/ProducerSettings.tsx` — único arquivo modificado.