## Mudanças na página pública do evento (`src/pages/EventDetails.tsx`)

### 1. "Sobre o evento" — preservar formatação
Hoje o texto da descrição é renderizado em um único `<p>`, perdendo as quebras de linha que o produtor digitou no textarea.

- Trocar o `<p>` por um container com `whitespace-pre-wrap`, ou dividir em parágrafos por `\n\n`:
  ```tsx
  <div className="text-muted-foreground leading-relaxed space-y-4">
    {(event.description || event.short_description || '')
      .split(/\n{2,}/)
      .map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">{para}</p>
      ))}
  </div>
  ```
- Resultado: parágrafos separados, quebras simples preservadas (igual ao print 3 do produtor).

### 2. Bloco "Realização" — abaixo da descrição
Novo card mostrando produtora responsável pelo evento (igual ao print 1).

Layout:
```text
Realização
┌─────────────────────────────────────────────┐
│ [logo]   Nome da Produtora                  │
│          (X eventos realizados — opcional)  │
└─────────────────────────────────────────────┘
```

- Buscar `producer_profiles` (campos `brand_name`, `logo_url`) usando `event.producer_profile_id`.
  - Estendo `useEvent` (em `src/hooks/useEvents.ts`) para já trazer `producer_profiles ( brand_name, logo_url )` via select com join.
- Renderizar logo:
  - Se `producer_profile.logo_url` existir → usar.
  - Caso contrário → fallback com a logo padrão do **FestPag** (importar `src/assets/festpag-logo.*` se existir; se não existir, criar um asset/placeholder simples — verifico no momento de implementar).
- Texto:
  - Linha 1: `brand_name` (em destaque).
  - Linha 2: pequeno texto cinza "Realização" ou contagem opcional. Manter simples, sem contar eventos por enquanto (evita query extra).

## Configurações do produtor (`src/pages/ProducerSettings.tsx`)
O campo **"Nome da Marca / Organização"** (`brand_name`) já existe e já é editável. Vou apenas:
- Confirmar que ele é o que será refletido no bloco "Realização" da página pública.
- Sem mudanças adicionais necessárias para o nome.
- (Logo customizada por produtora fica para um próximo passo — neste bloco usamos sempre o fallback FestPag a menos que `logo_url` já esteja preenchido no banco.)

## Arquivos afetados
- `src/pages/EventDetails.tsx` — formatação da descrição + bloco Realização.
- `src/hooks/useEvents.ts` — `useEvent` passa a trazer dados básicos da produtora via join.
- (Eventualmente) `src/assets/festpag-logo.png` — só se ainda não existir um asset utilizável.

Sem mudanças no banco, RLS, tipos, ou em ProducerSettings.