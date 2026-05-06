# Refinar página de Configurações do Produtor

Vou reformular a página `/produtor/configuracoes` para ficar tudo em **um único card**, com **um único botão "Salvar Configurações"**, e adicionar **upload de logo da produtora**.

## O que muda

### 1. Card único, com seções internas
Em vez de dois cards separados (Dados Pessoais / Produtora) com dois botões, será **um card grande** dividido em seções visuais:

```text
┌─────────────────────────────────────────────────────────┐
│ ⚙️  Configurações da Conta                              │
│     Gerencie seu perfil e os dados da sua produtora     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🏢 PRODUTORA  (destaque — aparece em "Realização")     │
│  ┌───────┐                                              │
│  │ LOGO  │   Nome da Produtora: [Made in Brazil Bar  ] │
│  │ 96x96 │   Pré-visualização da credencial pública   │
│  └───────┘                                              │
│  Trocar logo | Remover                                  │
│                                                         │
│  ── Dados fiscais (opcional) ──                         │
│  Razão Social  | CNPJ/CPF                               │
│  Email contato | Telefone                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 👤 DADOS PESSOAIS                                       │
│  Email (readonly) | Nome completo | WhatsApp           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                          [ Salvar Configurações ]       │
└─────────────────────────────────────────────────────────┘
```

- **Mobile**: tudo empilhado naturalmente.
- **Desktop**: campos em grid 2-colunas dentro de cada seção.
- Os "Dados Pessoais" recebem o mesmo tratamento visual moderno da seção Produtora (ícones nos campos, cabeçalho com badge, separadores) para sumir com o "ar de versão antiga".

### 2. Upload de logo da produtora
- Novo campo de logo no topo da seção Produtora, com preview circular 96×96.
- Reutiliza o componente existente `ImageUpload` + hook `useImageUpload` (que já faz upload pro bucket `event-images`).
- Botões: **Trocar logo** / **Remover**. Se vazio, mostra fallback do logo FestPag na pré-visualização.
- Salva em `producer_profiles.logo_url`.
- A pré-visualização da "Realização" passa a usar o logo recém-carregado em tempo real.

### 3. Botão único "Salvar Configurações"
- Um único botão no rodapé do card, com gradiente Indigo→Magenta.
- Internamente dispara em paralelo:
  - `update profiles` (nome_completo, whatsapp)
  - `update producer_profiles` (brand_name, logo_url, legal_name, document, email, phone)
- Loading state único; toast de sucesso único; toast de erro se algum falhar.
- Detecta se nada mudou e avisa "Nenhuma alteração para salvar".

## Detalhes técnicos

**Arquivo único editado**: `src/pages/ProducerSettings.tsx`

- Remover os dois handlers `handleSaveProfile` / `handleSaveOrg`. Substituir por `handleSaveAll` que faz `Promise.all` dos dois updates e invalida queries.
- Importar `ImageUpload` de `@/components/producer/ImageUpload` e usar variante compacta (envolver em um wrapper de tamanho fixo para ficar como avatar quadrado, já que o componente padrão é aspect-video — podemos colocar um wrapper `w-32` ou criar um modo "avatar" inline com `<input type=file>` + preview circular). Para manter simples e consistente, vou usar o `ImageUpload` existente dentro de um container `max-w-[180px]` e aspect-square via classe extra, ou — se ficar feio — fazer um upload inline próprio no arquivo (≈30 linhas) reutilizando `useImageUpload`.
- Manter o tipo de coluna `logo_url` que já existe em `producer_profiles` (visto em mensagens anteriores). **Sem migrações de banco.**
- Manter Helmet/SEO.
- Layout: um `Card` único `max-w-4xl mx-auto`, com `<section>` separadas por `<Separator>`.

## Fora do escopo
- Sem mudanças em rotas, RLS, edge functions ou outras páginas.
- Página pública do evento já consome `brand_name` e `logo_url` — refletirá automaticamente.
